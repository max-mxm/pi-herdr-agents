# Herdr Desktop transport (experimental local adaptation)

This branch adds a local `hc` transport alongside classic Herdr. It does not change
an installed Pi profile automatically, and it does not require spoofing
`HERDR_ENV` or pointing the classic CLI at Desktop.

## Selection and scope

- With `HC_TERMINAL_ID` set and `HERDR_ENV` not equal to `1`, the default runtime
  selects Desktop. It checks that the caller is a live **local** terminal.
- With `HERDR_ENV=1`, classic Herdr keeps precedence. Injected infrastructure used
  by tests or hosts still takes precedence over environment detection.
- Ordinary launch, session resume, screen/process observation, Escape and terminal
  closure go through `hc`, not the classic Herdr CLI. Children run interactive Pi.
- Native parent-child relationships make children available in Desktop's agent
  list, without changing the current layout or stealing focus. Classic grouped
  tabs and split-placement preferences are not implemented by this transport.
- Result delivery still uses the existing session, completion and activity
  protocol. A terminal's `done` status alone is not completion evidence.
- Observations are asynchronous. Control actions apply only to terminals created
  by the owning transport instance. The caller's terminal cannot be acquired as
  its own child. Invalid, duplicate, offline and mismatched observations never
  prove absence or successful termination.
- Native terminal termination ends that child's terminal tree; an owned parent
  terminal is never closed by cancelling one of its children. A confirmed stop
  requires a matching finished-terminal reply.
- Classic sidebar markers are disabled in Desktop, including when the classic
  socket environment happens to be inherited. Desktop title/focus changes and
  classic sidebar actions are unsupported.

## Authentication environment

Desktop's core has its own environment; it does not automatically inherit the
shell variables of the calling Pi process. A credential available in the parent
can therefore be absent in a newly created terminal even with the correct profile.

The local transport now reads credential/header environment references declared
in the caller's `models.json`, including per-model headers and overrides. It
forwards only the referenced variables that are present, plus the Pi agent home,
through the local `terminal.run` RPC over stdin. Credential values are not placed
in process arguments, generated scripts, terminal labels or diagnostic messages.
Unrelated environment variables and literal credentials are not copied. Leading
credential commands are not executed or inspected to infer their dependencies.
Credentials stored in `auth.json` continue to use Pi's normal profile loading.

The Desktop integration fixture now requires a random, memory-only credential
provided exclusively through an environment reference. Parent and child requests,
resume, persistent follow-up and cancellation must all work with that gate. The
test also checks that the credential is absent from generated scripts and sessions.
This is regression coverage, not proof of access to any external account.

Reload the parent after changing the local package, then launch new children;
already-running children do not receive environment changes retroactively. No
core restart, permanent key copy or global environment change is needed.

## Worktree safety

**Automatic managed-worktree launch, interactive handoff, inventory and removal
are not supported in Desktop yet.** Runtime guards refuse launch/handoff before
provisioning and refuse the cleanup factory before its Git or classic-server
fallbacks can run. A list failure means unsupported/unknown, not an empty list.

If code needs isolation, the caller can prepare a dedicated Git worktree first,
then use its path as an ordinary child's `cwd`. Such a checkout is not managed
by this extension and must be reviewed and retained by the caller. Cancelling
that ordinary child ends its terminal, not the externally prepared checkout.

Session resume and persistent-specialist follow-up/stop are covered by real
Desktop integration tests using a local deterministic fixture. Escape key mapping
is unit-tested; there is not yet a real Desktop interruption scenario. These
checks do not establish compatibility with every external account or service.

## Verification

Unit tests must not inherit a live Desktop terminal identity. The existing
isolated-agent-home helper clears the Desktop caller variables. On macOS, use a
canonical temporary path to avoid unrelated `/var` versus `/private/var` fixture
comparisons; serial execution also avoids short fixture deadlines under load:

```bash
TMPDIR=/private/tmp node --experimental-strip-types --test --test-concurrency=1 \
  test/test.ts test/worktree-cleanup.test.ts test/launch.test.ts \
  test/runtime-routing.test.ts test/release-workflow.test.ts \
  test/package-manifest.test.js test/sidebar-plugin.test.js test/maestro/*.test.ts
```

From a local Desktop terminal, explicitly run the separate integration suite:

```bash
PI_TEST_DESKTOP=1 node --experimental-strip-types --test test/desktop/lifecycle.test.ts
```

This suite starts real interactive parent and child Pi processes against a
local deterministic HTTP fixture. It verifies result delivery, session resume,
two persistent tasks followed by a confirmed stop, and active-child cancellation,
including a confirmed cancellation result and absence of surviving test children. It uses no account credentials or browser automation. Temporary
sessions and scripts are retained for diagnosis. Only test-owned terminals are
closed. These are transport/lifecycle integration tests, not proof that any
application or business ticket is validated.

## Activation and rollback

No automatic install, push or publication is performed. Before activating this
branch in a profile, preserve that profile's existing package settings, disable
only its existing copy of this extension and load the local package instead.
Do not load both copies or disable unrelated safety extensions. Reload Pi after
the targeted switch. The local worktree must remain available while it is loaded.

Rollback consists of restoring that one package selection and reloading Pi.
Retain configuration, sessions, branches and worktrees. No server restart,
terminal-wide cleanup or profile reset is required.
