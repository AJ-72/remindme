import { sendOtp, verifyOtp, unconfiguredOtpProvider, type OtpProvider } from "@/services/OtpService";

describe("sendOtp", () => {
  it("delegates to the given provider's send and returns its result", async () => {
    const provider: OtpProvider = {
      send: jest.fn().mockResolvedValue({ ok: true }),
      verify: jest.fn(),
    };

    const result = await sendOtp(provider, "+919876543210");

    expect(provider.send).toHaveBeenCalledWith("+919876543210");
    expect(result).toEqual({ ok: true });
  });

  it("propagates a failure result from the provider without throwing", async () => {
    const provider: OtpProvider = {
      send: jest.fn().mockResolvedValue({ ok: false, error: "rate_limited" }),
      verify: jest.fn(),
    };

    const result = await sendOtp(provider, "+919876543210");

    expect(result).toEqual({ ok: false, error: "rate_limited" });
  });
});

describe("verifyOtp", () => {
  it("delegates to the given provider's verify and returns its result", async () => {
    const provider: OtpProvider = {
      send: jest.fn(),
      verify: jest.fn().mockResolvedValue({ ok: true }),
    };

    const result = await verifyOtp(provider, "+919876543210", "123456");

    expect(provider.verify).toHaveBeenCalledWith("+919876543210", "123456");
    expect(result).toEqual({ ok: true });
  });

  it("propagates a failure result from the provider without throwing", async () => {
    const provider: OtpProvider = {
      send: jest.fn(),
      verify: jest.fn().mockResolvedValue({ ok: false, error: "invalid_code" }),
    };

    const result = await verifyOtp(provider, "+919876543210", "000000");

    expect(result).toEqual({ ok: false, error: "invalid_code" });
  });
});

describe("unconfiguredOtpProvider", () => {
  it("refuses to send since no real OTP provider is chosen yet (T0.4/T0.5)", async () => {
    const result = await unconfiguredOtpProvider.send("+919876543210");

    expect(result).toEqual({ ok: false, error: "provider_not_configured" });
  });

  it("refuses to verify since no real OTP provider is chosen yet (T0.4/T0.5)", async () => {
    const result = await unconfiguredOtpProvider.verify("+919876543210", "123456");

    expect(result).toEqual({ ok: false, error: "provider_not_configured" });
  });
});
