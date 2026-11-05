# Herdr Desktop transport (experimental local adaptation)

This branch adds a local `hc` transport alongside classic Herdr. It does not change
an installed Pi profile automatically, and it does not require spoofing
`HERDR_ENV` or pointing the classic CLI at Desktop.

## Install this fork

The shared source is
[`max-mxm/pi-herdr-agents`](https://github.com/max-mxm/pi-herdr-agents), branch
`feat/herdr-desktop`. The upstream npm package is a different build.
For a French walkthrough, see [Installation et dépannage](desktop-install.fr.md).

1. Install Pi with package support, Git, Herdr Desktop and its `hc` CLI. Desktop
   children use `/bin/bash`. The maintainer's observed environment is macOS,
   Node.js 26.7.0, Pi 1.5.0, `hc` 0.1.18 and Herdr Desktop 0.1.13. These are
   observed versions, not a tested compatibility range; native Windows and remote
   Desktop terminals have not been verified.
2. In the profile you use, remove only the previous copy of this extension if
   present. For an npm source: `pi remove npm:pi-herdr-agents`. For a Git or local
   source, remove that configured source. Keep unrelated packages and credentials.
   If using a custom profile, set `PI_CODING_AGENT_DIR` before these commands.
3. Install this fork:

   ```bash
   pi install git:https://github.com/max-mxm/pi-herdr-agents.git@feat/herdr-desktop
   ```

4. In a Herdr Desktop terminal, open your project and start Pi, or `/reload` an
   existing parent after installation. Do not set `HERDR_ENV=1`; Herdr supplies
   `HC_TERMINAL_ID`. Both `pi` and `hc` must be on the terminal's `PATH`.
5. Configure your own Pi authentication and select a model you can use. A working
   parent is required before delegating. No named roles or model credentials are
   supplied by this fork. Your provider profile belongs to you, not this package.
6. Load `/skill:pi-herdr-agents` in Pi for the operating guide. Named roles are
   optional; a plain-language request can launch an ordinary child without one.

For an optional first read-only check, ask Pi to launch one ordinary child, with
no named role, and have it return `DESKTOP_OK` without changing files. The marker
must arrive in the parent, not merely appear in a finished child's terminal.
This is a transport check; it says nothing about application correctness.

The custom cockpit, footer and workflow configuration from a maintainer's machine
are separate. They are not required to launch Desktop children with this package.

## Updating and local changes

Repeat the Git install command and reload Pi to move to the current branch
revision. Use a full commit SHA instead of the branch name for a reproducible
installation. Updating the parent's code does not update already-running children.

To investigate or adapt the extension with an AI assistant, make a source checkout
outside Pi's managed package cache:

```bash
git clone https://github.com/max-mxm/pi-herdr-agents.git
cd pi-herdr-agents
git switch feat/herdr-desktop
```

Remove the installed Git package from the same profile, then run `pi install`
with the absolute path to this checkout and reload Pi. Keep the checkout while
it is loaded. Read `AGENTS.md` and the scope below before changing runtime code;
the French guide includes a bounded diagnostic prompt. Report a reproducible
problem in this fork's [issues](https://github.com/max-mxm/pi-herdr-agents/issues),
with versions and redacted errors, never credentials or entire private sessions.

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

## Rollback

Restore the previous package source in the same profile, then reload Pi. Keep
one copy active. Retain configuration, sessions, branches and worktrees. A local
source checkout must remain available while selected. No core restart,
terminal-wide cleanup or profile reset is required.
