// The supabase-js client is mocked entirely here, per createClient() call,
// so each test can assert exactly which auth methods SessionService invokes
// — which is the code-level property that stands in for "makes a network
// call": getSession() is documented (and, for a never-bound user, trivially
// true — there is nothing in storage to read) to touch only local storage,
// while signInAnonymously() is the one operation that reaches Supabase Auth.
// jest.resetModules() per test gives SessionService a fresh lazy-singleton
// client each time, so "was createClient called at all" is itself testable.

function mockSupabaseClient(overrides?: {
  getSession?: jest.Mock;
  signInAnonymously?: jest.Mock;
}) {
  const getSession =
    overrides?.getSession ?? jest.fn().mockResolvedValue({ data: { session: null }, error: null });
  const signInAnonymously =
    overrides?.signInAnonymously ??
    jest.fn().mockResolvedValue({ data: { session: { access_token: "mock" } }, error: null });

  return {
    createClient: jest.fn(() => ({
      auth: { getSession, signInAnonymously },
    })),
    getSession,
    signInAnonymously,
  };
}

function freshImport(overrides?: Parameters<typeof mockSupabaseClient>[0]) {
  jest.resetModules();
  const mocks = mockSupabaseClient(overrides);
  jest.doMock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const service = require("@/services/SessionService");
  return { service, ...mocks };
}

describe("SessionService", () => {
  afterEach(() => {
    jest.dontMock("@supabase/supabase-js");
  });

  it("never constructs a supabase client just from being imported", async () => {
    const { createClient } = freshImport();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("a user who never binds makes zero network calls: getCurrentSession/hasSession never call signInAnonymously", async () => {
    const { service, signInAnonymously, getSession } = freshImport();

    expect(await service.getCurrentSession()).toBeNull();
    expect(await service.hasSession()).toBe(false);

    expect(getSession).toHaveBeenCalled();
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it("reuses one client across repeated calls rather than reconnecting each time", async () => {
    const { service, createClient } = freshImport();

    await service.hasSession();
    await service.hasSession();
    await service.getCurrentSession();

    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it("hasSession reflects an already-cached local session without signing in", async () => {
    const { service, signInAnonymously } = freshImport({
      getSession: jest.fn().mockResolvedValue({
        data: { session: { access_token: "already-there" } },
        error: null,
      }),
    });

    expect(await service.hasSession()).toBe(true);
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it("ensureSession signs in anonymously only when no session exists yet", async () => {
    const { service, signInAnonymously } = freshImport();

    const session = await service.ensureSession();

    expect(session).toEqual({ access_token: "mock" });
    expect(signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it("ensureSession does not sign in again if a session already exists", async () => {
    const { service, signInAnonymously } = freshImport({
      getSession: jest.fn().mockResolvedValue({
        data: { session: { access_token: "already-there" } },
        error: null,
      }),
    });

    const session = await service.ensureSession();

    expect(session).toEqual({ access_token: "already-there" });
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it("ensureSession shares one in-flight sign-in across concurrent callers", async () => {
    const { service, signInAnonymously } = freshImport();

    const [a, b] = await Promise.all([service.ensureSession(), service.ensureSession()]);

    expect(a).toEqual(b);
    expect(signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it("ensureSession throws rather than returning an empty session on failure", async () => {
    const { service } = freshImport({
      signInAnonymously: jest.fn().mockResolvedValue({
        data: { session: null },
        error: { message: "boom" },
      }),
    });

    await expect(service.ensureSession()).rejects.toBeTruthy();
  });
});
