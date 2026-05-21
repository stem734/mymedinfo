## 2025-05-15 - [Information Leakage in Edge Function Error Responses]
**Vulnerability:** Supabase Edge Functions were returning raw database and auth error messages (`error.message`) to the client.
**Learning:** Returning raw errors from backend services can expose internal schema names, table structures, and authentication provider details to potential attackers.
**Prevention:** Always log detailed error objects to the server-side console for debugging and return a generic, secure message to the client via `errorResponse`.
