# DONT COMMIT JUST SAVE

Blocks git pushes when any commit message contains `DONT COMMIT JUST SAVE`. No config.

<img width="750" alt="Screenshot" src="https://github.com/user-attachments/assets/f32c2784-2ed9-4726-8f21-7b64dbef8086" />

-   **Block Alert** - Push blocked (modal in VS Code); works with UI, terminal, external git
-   **Insert Button** - `Insert DONT COMMIT JUST SAVE` in Source Control bar → commit message gets the marker
-   **Undo Button** - `Soft Reset (HEAD~N)` in SCM bar: suggests N if last commits are DCJS, else enter N

**Requirements:** VS Code 1.85+, Git on system.

| Doc                                            | Purpose                                       |
| ---------------------------------------------- | --------------------------------------------- |
| [docs/LOCAL_TESTING.md](docs/LOCAL_TESTING.md) | Run locally (F5), install .vsix, watch, tests |
| [docs/PUBLISHING.md](docs/PUBLISHING.md)       | Publish to Marketplace + Open VSX             |

MIT - [LICENSE](LICENSE)
