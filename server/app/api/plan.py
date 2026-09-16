from fastapi import APIRouter, Depends

from app.config import Settings, get_settings
from app.schemas.payload import PayloadV1
from app.schemas.plan import PlanV1
from app.vlm.base import VLMAdapter

router = APIRouter()


@router.post("/v1/plan", response_model=PlanV1, response_model_by_alias=True)
async def plan(payload: PayloadV1, settings: Settings = Depends(get_settings)) -> PlanV1:
    adapter: VLMAdapter = settings.adapter
    return await adapter.plan(payload)
