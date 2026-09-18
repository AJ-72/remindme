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
  getUser?: jest.Mock;
  signOut?: jest.Mock;
}) {
  const getSession =
    overrides?.getSession ?? jest.fn().mockResolvedValue({ data: { session: null }, error: null });
  const signInAnonymously =
    overrides?.signInAnonymously ??
    jest.fn().mockResolvedValue({ data: { session: { access_token: "mock" } }, error: null });
  const getUser =
    overrides?.getUser ?? jest.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  const signOut = overrides?.signOut ?? jest.fn().mockResolvedValue({ error: null });

  return {
    createClient: jest.fn(() => ({
      auth: { getSession, signInAnonymously, getUser, signOut },
    })),
    getSession,
    signInAnonymously,
    getUser,
    signOut,
  };
}

const cachedSession = (access_token: string) =>
  jest.fn().mockResolvedValue({ data: { session: { access_token } }, error: null });

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

  // Regression: deleting an auth.users row server-side used to brick that
  // install — the orphaned token stayed cached, every call 403'd, and the
  // refresh grant 400'd with no path back short of clearing app storage.
  it("ensureSession replaces a cached session whose user no longer exists", async () => {
    const { service, signInAnonymously, signOut } = freshImport({
      getSession: cachedSession("orphaned"),
      getUser: jest.fn().mockResolvedValue({
        data: { user: null },
        error: { message: "user_not_found", status: 403 },
      }),
    });

    const session = await service.ensureSession();

    expect(session).toEqual({ access_token: "mock" });
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it("ensureSession keeps a cached session whose user still exists", async () => {
    const { service, signInAnonymously, signOut } = freshImport({
      getSession: cachedSession("still-good"),
    });

    const session = await service.ensureSession();

    expect(session).toEqual({ access_token: "still-good" });
    expect(signOut).not.toHaveBeenCalled();
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  // The ambiguous case must fail safe: discarding a valid account because the
  // device was briefly offline would be worse than the bug above.
  it("ensureSession keeps a cached session when revalidation fails for a network reason", async () => {
    const { service, signInAnonymously, signOut } = freshImport({
      getSession: cachedSession("offline-but-valid"),
      getUser: jest.fn().mockResolvedValue({
        data: { user: null },
        error: { message: "Network request failed" },
      }),
    });

    const session = await service.ensureSession();

    expect(session).toEqual({ access_token: "offline-but-valid" });
    expect(signOut).not.toHaveBeenCalled();
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it("does not revalidate when there is no cached session to check", async () => {
    const { service, getUser } = freshImport();

    await service.ensureSession();

    expect(getUser).not.toHaveBeenCalled();
  });
});
