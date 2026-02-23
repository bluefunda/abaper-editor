# ABAPer: Product Positioning

## What is ABAPer?

ABAPer is a browser-based ABAP development environment with an integrated AI assistant. At its core, it combines:

1. **Monaco Editor** — the same editor engine behind VS Code, with ABAP syntax highlighting and abaplint-powered diagnostics
2. **Live SAP ADT Connection** — direct connectivity to SAP systems (S/4HANA, BTP ABAP Environment) via ADT REST APIs
3. **AI Assistant** — LLM-powered chat with MCP (Model Context Protocol) tool access to the connected SAP system

## How does this compare to VS Code + GitHub Copilot?

### What VS Code + Copilot already does well

| Capability | VS Code + Copilot | ABAPer |
|---|---|---|
| Code editor | VS Code (mature, extensible) | Monaco (same engine, browser-based) |
| AI code completion | Copilot inline suggestions | Not yet (planned) |
| AI chat | Copilot Chat with @workspace | CAI chat with MCP tools |
| ABAP syntax | abapGit + abaplint extensions | Built-in abaplint |
| Local file editing | Native | N/A (browser-based) |
| Extension ecosystem | Thousands of extensions | Focused feature set |

### Where ABAPer differentiates

The key differentiator is **live SAP system connectivity from the browser**:

- **No local install required** — open a browser, connect to your SAP system, start coding
- **SAP ADT integration** — browse packages, read/write objects, activate, run unit tests, check transports — all through the browser
- **AI with SAP context** — the AI assistant can query the connected SAP system via MCP tools (read object source, check syntax, list packages, create objects)
- **Multi-system connections** — connect to multiple SAP systems simultaneously, switch between them

### Honest assessment

At the core level, ABAPer is **Editor + AI Assistant** — the same fundamental value proposition as VS Code + Copilot. The AI chat capabilities (streaming responses, markdown rendering, code highlighting) are table stakes.

**The moat is SAP system connectivity.** Without a live SAP connection, ABAPer is just another editor. With it, the AI assistant becomes genuinely compelling because it can:

- Read actual ABAP source from the system
- Check syntax against the real SAP environment
- Create and modify objects on the system
- Run unit tests and return results
- Navigate includes and dependencies

### Target users

1. **ABAP developers who want browser-based development** — no Eclipse ADT install, works from any machine
2. **Teams wanting AI-assisted ABAP development** — AI that understands not just ABAP syntax but your specific system's objects
3. **Consultants working across multiple SAP systems** — quick browser access without configuring Eclipse for each system

## Architecture advantage

```
┌─────────────┐     ┌───────────┐     ┌─────────────┐     ┌───────────┐
│   Browser    │────▶│  abaper-  │────▶│  abaper-ts  │────▶│    SAP    │
│  (Editor UI) │     │    gw     │     │  (ADT proxy) │     │  System   │
└─────────────┘     └───────────┘     └─────────────┘     └───────────┘
       │                                     ▲
       │            ┌───────────┐            │
       └───────────▶│  ai-gw    │────▶ abaper-mcp ──────┘
         (AI chat)  │ (CAI-GW)  │     (MCP tools)
                    └───────────┘
```

The AI assistant doesn't just generate code in isolation — it operates on the same SAP connection the editor uses. When the AI creates a program, it goes through `abaper-ts` which writes it to the actual SAP system via ADT APIs.

## Strategic direction

1. **Double down on SAP connectivity** — this is the moat. More ADT operations, better system browsing, transport management.
2. **AI inline completion** — Copilot-style suggestions using SAP system context (data elements, structures, methods from the connected system).
3. **Multi-system workflows** — compare objects across systems, transport tracking, landscape-aware development.
4. **Collaboration** — shared browser sessions, code review workflows built for ABAP teams.
