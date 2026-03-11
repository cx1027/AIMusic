from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.database import engine
from app.models.user import User


@pytest.fixture
def ensure_credits(test_user: tuple[User, str]):
    user, _token = test_user
    with Session(engine) as session:
        u = session.get(User, user.id)
        u.credits_balance = 10
        session.add(u)
        session.commit()
    return True


def test_music_generate_and_poll_completed(client: TestClient, test_user: tuple[User, str], ensure_credits: bool):
    user, token = test_user

    # Minimal in-memory progress store to avoid needing Redis in unit tests
    store: dict[str, dict] = {}

    def fake_init_task(task_id: str, *, user_id: str, payload: dict, ttl_seconds: int = 3600):
        store[task_id] = {
            "task_id": task_id,
            "user_id": user_id,
            "status": "queued",
            "progress": 0,
            "message": "queued",
            "payload": payload,
            "result": None,
        }

    def fake_update_task(task_id: str, *, status=None, progress=None, message=None, result=None, ttl_seconds: int = 3600):
        st = store.get(task_id, {"task_id": task_id})
        if status is not None:
            st["status"] = status
        if progress is not None:
            st["progress"] = int(progress)
        if message is not None:
            st["message"] = message
        if result is not None:
            st["result"] = result
        store[task_id] = st

    def fake_get_task(task_id: str):
        return store.get(task_id)

    settings = SimpleNamespace(music_generation_backend="runpod")

    with patch("app.api.routes.music.get_settings", return_value=settings), \
         patch("app.api.routes.music.init_task", side_effect=fake_init_task), \
         patch("app.api.routes.music.update_task", side_effect=fake_update_task), \
         patch("app.api.routes.music.get_task", side_effect=fake_get_task), \
         patch("app.api.routes.music.submit_runpod_job") as mock_submit, \
         patch("app.api.routes.music.get_runpod_status") as mock_status:
        mock_submit.return_value = SimpleNamespace(runpod_job_id="rp_123", raw={"id": "rp_123"})
        mock_status.return_value = SimpleNamespace(status="COMPLETED", output_url="https://r2.example.com/out.mp3", raw={})

        # Create job
        resp = client.post(
            "/api/music/generate",
            json={
                "mode": "custom",
                "caption": "lofi chill, dusty drums, warm pads",
                "lyrics": "[Verse]\nLa la la\n",
                "audio_duration": 60,
                "audio_format": "mp3",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 201
        job = resp.json()
        assert "job_id" in job
        assert job["runpod_job_id"] == "rp_123"
        
        # Verify RunPod payload includes all mandatory fields (no None values for numeric params)
        assert mock_submit.call_count == 1
        submitted = mock_submit.call_args.kwargs["input_payload"]
        for k in (
            "mode",
            "caption",
            "lyrics",
            "duration",
            "bpm",
            "keyscale",
            "timesignature",
            "vocal_language",
            "thinking",
            "lm_temperature",
            "lm_top_p",
            "lm_top_k",
            "lm_cfg_scale",
            "inference_steps",
            "guidance_scale",
            "seed",
            "batch_size",
            "audio_format",
        ):
            assert k in submitted
        for k in ("bpm", "lm_temperature", "lm_top_p", "lm_top_k", "lm_cfg_scale", "guidance_scale", "seed"):
            assert submitted[k] is not None

        # Poll status
        resp2 = client.get(
            f"/api/music/status/{job['job_id']}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp2.status_code == 200
        st = resp2.json()
        assert st["status"] == "completed"
        assert st["result"]["output_url"] == "https://r2.example.com/out.mp3"

        # Verify credits deducted (2)
        with Session(engine) as session:
            u = session.exec(select(User).where(User.id == user.id)).one()
            assert u.credits_balance == 8

