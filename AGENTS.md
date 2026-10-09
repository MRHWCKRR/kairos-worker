# Kairos Worker Agent Guide

## Service role
`kairos-worker` is backend/AI infrastructure for Kairos. Treat it as production service code that sits behind the web, iOS, and Android clients.

## Architecture
- Preserve the current TypeScript + Cloudflare Worker architecture.
- Use the existing `src`, `test`, `wrangler.jsonc`, TypeScript, Vitest, and package tooling.
- Do not move the service to another runtime or framework unless explicitly requested.
- Keep request handling, AI orchestration, validation, and external-service integration separated where the existing structure allows it.
- Prefer small, explicit modules over a single large handler.

## API stability
- Existing clients may depend on current endpoint shapes and response semantics.
- Do not silently change public request/response contracts.
- If an API contract must change, preserve backwards compatibility where practical or document the migration clearly.
- Validate all external input at the boundary.
- Return predictable structured errors rather than leaking internal exceptions.

## AI behavior
- Treat model output as untrusted input.
- Never execute arbitrary model-generated instructions directly against user data.
- Prefer structured, schema-validated Kairos actions such as `task.create`, `task.update`, `task.delete`, `board.create`, `board.update`, `schedule.move`, and related domain actions.
- Validate action type, identifiers, required fields, allowed fields, and user authorization before mutation.
- Keep prompt/context assembly separate from action execution where practical.
- Do not expose secrets, internal prompts, provider credentials, stack traces, or privileged implementation details to clients.
- Avoid relying on brittle free-form parsing when a structured response format is available.

## Authentication and authorization
- Treat client-provided identity claims as untrusted until verified.
- Enforce authorization server-side for all user-specific actions.
- Never accept a user ID alone as proof of identity.
- Preserve Firebase/Auth verification behavior used by Kairos clients.
- Fail closed on authorization uncertainty.

## Security
- Never hard-code API keys, service credentials, private tokens, or secrets into source control.
- Use Worker secrets/environment bindings for sensitive values.
- Do not log authentication tokens, full user prompts containing sensitive data, secrets, or personally identifying payloads unnecessarily.
- Sanitize and bound user-controlled input.
- Apply reasonable limits to payload size, model context size, retries, and expensive operations.
- Be cautious with CORS changes; do not broaden allowed origins without a specific requirement.

## Reliability and cost control
- Handle provider timeouts, non-2xx responses, malformed responses, and transient failures explicitly.
- Avoid unbounded loops, uncontrolled retries, or duplicate external requests.
- Keep AI requests bounded by sensible token/context limits.
- Preserve idempotency where an endpoint may be retried.
- Avoid duplicate writes when requests are retried or clients reconnect.
- Prefer deterministic validation and transformation outside the model whenever possible.

## Cross-client compatibility
Kairos Web, Kairos iOS, and Kairos Android consume the same product concepts. Changes involving these concepts should remain compatible across clients:
- accounts and profiles
- tasks
- boards and sections
- reminders
- schedules
- AI conversations
- AI actions
- user preferences

Do not introduce backend behavior that only one client can interpret unless explicitly scoped that way.

## Code quality
- Keep TypeScript types precise; avoid `any` unless there is a compelling reason.
- Reuse existing utilities and types before adding duplicates.
- Keep pure transformation/validation logic testable independently of Worker request handling.
- Do not add dependencies without justification.
- Do not edit generated files such as `worker-configuration.d.ts` manually unless the project workflow explicitly requires it.
- Respect the existing formatting and TypeScript configuration.
- Avoid unrelated refactors during focused fixes.

## Testing and verification
Before considering a backend change complete:
- Run the relevant Vitest tests.
- Add or update tests for validation, authorization, action parsing, and error cases when behavior changes.
- Type-check/build using the project's existing scripts.
- Verify success and failure responses for changed endpoints.
- Check that malformed model output cannot bypass validation.
- Check that unauthenticated or unauthorized requests fail correctly.
- Confirm existing client contracts remain intact unless the task intentionally changes them.

## Deployment discipline
- Treat `wrangler.jsonc` and environment bindings as production-sensitive configuration.
- Do not rename or remove bindings casually.
- Do not commit secret values.
- Keep development/test behavior clearly separated from production behavior.
- When changing an endpoint used by Kairos Web's Vercel relay or the native apps, account for that dependency explicitly.

## Scope discipline
- Change the smallest coherent surface required for the task.
- Preserve working behavior outside the requested change.
- If a request implies a Firebase schema, authentication, AI action-contract, or cross-client API change, identify it as a cross-platform concern rather than treating it as an isolated worker edit.