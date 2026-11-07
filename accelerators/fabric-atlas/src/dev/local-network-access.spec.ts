import { describe, expect, it } from "vitest";
import {
  applyLocalNetworkAccess,
  isApprovedDevOrigin,
  parseExtraOrigins,
} from "./local-network-access";

function fakeResponse() {
  const headers: Record<string, string> = {};
  return {
    headers,
    statusCode: 200,
    ended: false,
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
    },
    end() {
      this.ended = true;
    },
  };
}

const preflight = (origin?: string) => ({
  method: "OPTIONS",
  headers: {
    ...(origin ? { origin } : {}),
    "access-control-request-private-network": "true",
  },
});

describe("dev Local Network Access boundary", () => {
  it("approves only Fabric, Power BI, localhost and configured origins", () => {
    expect(isApprovedDevOrigin("https://app.fabric.microsoft.com")).toBe(true);
    expect(isApprovedDevOrigin("https://msit.powerbi.com")).toBe(true);
    expect(isApprovedDevOrigin("http://localhost:5173")).toBe(true);
    expect(isApprovedDevOrigin("https://evil.example.com")).toBe(false);
    expect(isApprovedDevOrigin("https://fabric.microsoft.com.evil.io")).toBe(false);
    expect(isApprovedDevOrigin("http://app.fabric.microsoft.com")).toBe(false);
    expect(isApprovedDevOrigin("https://my.portal.test", parseExtraOrigins(" https://my.portal.test/ ,"))).toBe(true);
  });

  it("answers an approved preflight with credentialed private-network headers", () => {
    const res = fakeResponse();
    expect(applyLocalNetworkAccess(preflight("https://app.fabric.microsoft.com"), res)).toBe(true);
    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("https://app.fabric.microsoft.com");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    expect(res.headers["access-control-allow-private-network"]).toBe("true");
  });

  it("refuses an unapproved preflight without any CORS header", () => {
    const res = fakeResponse();
    expect(applyLocalNetworkAccess(preflight("https://evil.example.com"), res)).toBe(true);
    expect(res.statusCode).toBe(403);
    expect(res.headers).toEqual({});
  });

  it("keeps the opt-in header for navigations without an Origin and passes them on", () => {
    const res = fakeResponse();
    expect(applyLocalNetworkAccess({ method: "GET", headers: {} }, res)).toBe(false);
    expect(res.headers["access-control-allow-private-network"]).toBe("true");
    expect(res.ended).toBe(false);
    const other = fakeResponse();
    expect(applyLocalNetworkAccess({ method: "GET", headers: { origin: "https://evil.example.com" } }, other)).toBe(false);
    expect(other.headers).toEqual({});
  });
});
