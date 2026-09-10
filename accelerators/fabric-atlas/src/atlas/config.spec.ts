import { describe, expect, it } from "vitest";
import { validateUdfUrl } from "./config";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const functionId = "22222222-2222-4222-8222-222222222222";
const validUrl =
  `https://workspace.z6b.userdatafunctions.fabric.microsoft.com/v1/workspaces/${workspaceId}` +
  `/userDataFunctions/${functionId}/functions/sync_all/invoke`;

describe("validateUdfUrl", () => {
  it("accepts the configured HTTPS Fabric UDF endpoint", () => {
    expect(validateUdfUrl(validUrl, workspaceId)).toBe(validUrl);
  });

  it.each([
    "https://userdatafunctions.fabric.microsoft.com.attacker.example/v1/workspaces/11111111-1111-4111-8111-111111111111/userDataFunctions/22222222-2222-4222-8222-222222222222/functions/sync_all/invoke",
    "http://workspace.z6b.userdatafunctions.fabric.microsoft.com/v1/workspaces/11111111-1111-4111-8111-111111111111/userDataFunctions/22222222-2222-4222-8222-222222222222/functions/sync_all/invoke",
    "https://user@workspace.z6b.userdatafunctions.fabric.microsoft.com/v1/workspaces/11111111-1111-4111-8111-111111111111/userDataFunctions/22222222-2222-4222-8222-222222222222/functions/sync_all/invoke",
    `${validUrl}?redirect=https://attacker.example`,
  ])("rejects an untrusted UDF URL before token use: %s", (value) => {
    expect(() => validateUdfUrl(value, workspaceId)).toThrow(
      /invalid UDF endpoint/i,
    );
  });

  it("rejects a UDF URL for another workspace", () => {
    expect(() =>
      validateUdfUrl(
        validUrl,
        "33333333-3333-4333-8333-333333333333",
      ),
    ).toThrow(/invalid UDF endpoint/i);
  });
});
