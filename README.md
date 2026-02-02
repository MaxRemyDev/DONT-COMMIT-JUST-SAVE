# DONT COMMIT JUST SAVE

Blocks git pushes when any commit message contains `DONT COMMIT JUST SAVE`.

---

<img width="1818" height="500" alt="INSERT_DCJS_PUSH_BLOCK" src="https://github.com/user-attachments/assets/d29a9d34-8806-429e-9ffd-dadb0ccc64c8" />
<img width="1818" height="500" alt="SOFT_RESET" src="https://github.com/user-attachments/assets/4dd8dd0d-01bd-4524-a47e-aa92a588b7ed" />

---

-   **Block Alert** - Push blocked (modal in VS Code); works with UI, terminal, external git
-   **Insert Button** - `Insert DONT COMMIT JUST SAVE` in Source Control bar → commit message gets the marker
-   **Undo Button** - `Soft Reset (HEAD~N)` in SCM bar: suggests N if last commits are DCJS, else enter N

**Requirements:** VS Code 1.85+, Git on system.
**No Configuration Needed !**

| Doc                                            | Purpose                                       |
| ---------------------------------------------- | --------------------------------------------- |
| [docs/LOCAL_TESTING.md](docs/LOCAL_TESTING.md) | Run locally (F5), install .vsix, watch, tests |
| [docs/PUBLISHING.md](docs/PUBLISHING.md)       | Publish to Marketplace + Open VSX             |

MIT - [LICENSE](LICENSE)
