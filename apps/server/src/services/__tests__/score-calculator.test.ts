import { describe, expect, it } from "vitest";
import { calculateMatchScore } from "../score-calculator";

describe("Score Calculator", () => {
  it("calculates basic score with parts", () => {
    const profileDefinition = {
      version: 1,
      parts: [
        {
          id: "auto",
          label: "Autonomous",
          type: "NUMBER" as const,
          pointsPerUnit: 5,
          maxValue: 20,
        },
        {
          id: "teleop",
          label: "Teleoperated",
          type: "NUMBER" as const,
          pointsPerUnit: 2,
          maxValue: 50,
        },
      ],
      penalties: [],
      totalFormula: "auto + teleop",
    };

    const input = {
      parts: [
        { partId: "auto", value: 10 },
        { partId: "teleop", value: 25 },
      ],
    };

    const result = calculateMatchScore(profileDefinition, input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.score).toBe(100); // (10 * 5) + (25 * 2)
      expect(result.opponentScoreAdjustment).toBe(0);
    }
  });

  it("applies SELF penalties correctly", () => {
    const profileDefinition = {
      version: 1,
      parts: [
        {
          id: "score",
          label: "Score",
          type: "NUMBER" as const,
          pointsPerUnit: 1,
        },
      ],
      penalties: [
        {
          id: "foul",
          label: "Foul",
          points: 5,
          target: "SELF" as const,
          direction: "SUBTRACT" as const,
        },
      ],
      totalFormula: "score - TOTAL_PENALTIES_SELF",
    };

    const input = {
      parts: [{ partId: "score", value: 100 }],
      penalties: [{ penaltyId: "foul", count: 2 }],
    };

    const result = calculateMatchScore(profileDefinition, input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.score).toBe(90); // 100 - (2 * 5)
      expect(result.opponentScoreAdjustment).toBe(0);
    }
  });

  it("applies OPPONENT penalties correctly", () => {
    const profileDefinition = {
      version: 1,
      parts: [
        {
          id: "score",
          label: "Score",
          type: "NUMBER" as const,
          pointsPerUnit: 1,
        },
      ],
      penalties: [
        {
          id: "opponent_foul",
          label: "Opponent Foul",
          points: 10,
          target: "OPPONENT" as const,
          direction: "ADD" as const,
        },
      ],
      totalFormula: "score",
    };

    const input = {
      parts: [{ partId: "score", value: 50 }],
      penalties: [{ penaltyId: "opponent_foul", count: 3 }],
    };

    const result = calculateMatchScore(profileDefinition, input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.score).toBe(50); // Own score unchanged
      expect(result.opponentScoreAdjustment).toBe(30); // 3 * 10 points to opponent
    }
  });

  it("serializes breakdown to JSON correctly", () => {
    const profileDefinition = {
      version: 1,
      parts: [
        {
          id: "test",
          label: "Test",
          type: "NUMBER" as const,
          pointsPerUnit: 1,
        },
      ],
      penalties: [],
      totalFormula: "test",
    };

    const input = {
      parts: [{ partId: "test", value: 42 }],
    };

    const result = calculateMatchScore(profileDefinition, input);

    expect(result.success).toBe(true);
    if (result.success) {
      // Should be serializable to JSON
      const json = JSON.stringify(result.breakdown);
      expect(json).toContain('"finalScore":42');
      expect(json).toContain('"profileVersion":1');
      expect(json).not.toBe("[object Object]");
    }
  });
});
