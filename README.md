# DONT COMMIT JUST SAVE

[VSM_URL]: https://marketplace.visualstudio.com/items?itemName=MaxRemyDev.dont-commit-just-save
[VSM_VERSION_BADGE]: https://img.shields.io/visual-studio-marketplace/v/MaxRemyDev.dont-commit-just-save
[VSM_INSTALLS_BADGE]: https://img.shields.io/visual-studio-marketplace/i/MaxRemyDev.dont-commit-just-save

[CHANGELOG_BADGE]: https://img.shields.io/badge/CHANGELOG-red.svg
[CHANGELOG_URL]: CHANGELOG.md

[![VS Marketplace Version][VSM_VERSION_BADGE]][VSM_URL] [![VS Marketplace Installs][VSM_INSTALLS_BADGE]][VSM_URL] [![CHANGELOG][CHANGELOG_BADGE]][CHANGELOG_URL]

Blocks git pushes when any commit message contains `DONT COMMIT JUST SAVE`.

---

**Feature 1** - Inserts `DONT COMMIT JUST SAVE` into the commit message, then blocks pushes in VS Code until it’s removed/amended.

<img width="1200" alt="INSERT_DCJS_PUSH_BLOCK" src="https://github.com/user-attachments/assets/d29a9d34-8806-429e-9ffd-dadb0ccc64c8" />

---

**Feature 2** - One-click `git reset --soft HEAD~N` (auto-suggests N) to drop marker commits while keeping changes staged.

<img width="1200" alt="SOFT_RESET" src="https://github.com/user-attachments/assets/4dd8dd0d-01bd-4524-a47e-aa92a588b7ed" />

---

**Feature 3** - Same protection in the terminal: `git push` is blocked if a marker commit exists.

<img width="1200" alt="TERMINAL" src="https://github.com/user-attachments/assets/464a811b-8302-4858-b8c0-385c13cf8b84" />

## TRY NOW

- **Requirements:** VS Code 1.85+, Git installed
- **Compatible:** [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=MaxRemyDev.dont-commit-just-save) + [Open-VSX](https://open-vsx.org/extension/MaxRemyDev/dont-commit-just-save)
- **No configuration needed**

## LICENSE
MIT - [LICENSE](LICENSE)
