import { getRedisClient } from "../lib/redis";

const STAGE_EVENT_PREFIX = "stage:events";

export type StageEventType =
  | "matches.updated"
  | "leaderboard.updated"
  | "stage.updated";

export type StageEventPayload = {
  stageId: string;
  type: StageEventType;
  timestamp: number;
  data?: Record<string, unknown>;
};

export function getStageEventChannel(stageId: string) {
  return `${STAGE_EVENT_PREFIX}:${stageId}`;
}

export async function publishStageEvent(
  stageId: string,
  type: StageEventType,
  data?: Record<string, unknown>
) {
  try {
    const redis = await getRedisClient();
    const payload: StageEventPayload = {
      stageId,
      type,
      timestamp: Date.now(),
      data,
    };
    await redis.publish(getStageEventChannel(stageId), JSON.stringify(payload));
  } catch (error) {
    console.error("Failed to publish stage event", error);
  }
}
