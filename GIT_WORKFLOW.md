# Git Workflow Guide

This guide outlines the Git workflow and best practices for the RMS Modern project. Following these guidelines ensures a clean, collaborative, and maintainable codebase.

## Branching Strategy

We follow a hierarchical branching model:

- **`main`**: The production-ready branch. Only stable, tested code is merged here.
- **`dev`**: The integration branch for ongoing development. Features are merged here before going to `main`.
- **`feat/*`**: Feature branches for individual features or bug fixes. Created from `dev`.

This structure promotes isolation, easy rollbacks, and continuous integration.

## Creating Branches

### Prerequisites

- Ensure your working directory is clean: `git status` should show no uncommitted changes.
- Pull the latest changes from the remote repository.

### Steps

1. **Start from `main`**:

   ```bash
   git checkout main
   git pull origin main
   ```

2. **Create and switch to `dev` branch** (if it doesn't exist):

   ```bash
   git checkout -b dev
   git push -u origin dev
   ```

3. **Create and switch to a feature branch**:

   ```bash
   git checkout dev
   git pull origin dev  # Ensure dev is up-to-date
   git checkout -b feat/your-feature-name
   git push -u origin feat/your-feature-name
   ```

   Use descriptive names for feature branches, e.g., `feat/add-user-authentication`, `bugfix/fix-login-validation`.

## Commit Rules

We use [Conventional Commits](https://www.conventionalcommits.org/) for consistent commit messages. This enables automatic changelog generation and semantic versioning.

### Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that do not affect the meaning of the code (white-space, formatting, etc.)
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `perf`: A code change that improves performance
- `test`: Adding missing tests or correcting existing tests
- `build`: Changes that affect the build system or external dependencies
- `ci`: Changes to our CI configuration files and scripts
- `chore`: Other changes that don't modify src or test files

### Examples

```
feat: add user authentication system
fix: resolve null pointer exception in tournament creation
docs: update API documentation for score profiles
refactor: simplify match scheduling algorithm
```

### Rules

- Use present tense ("add" not "added")
- Keep the subject line under 50 characters
- Use the body for detailed explanations if needed
- Reference issue numbers in the footer if applicable: `Closes #123`

## Merging and Pull Requests

### Pull Requests (PRs)

- Always create a PR for merging feature branches to `dev` or `dev` to `main`.
- Provide a clear title and description.
- Link to related issues.
- Request reviews from at least one team member.
- Ensure CI checks pass before merging.

### Merging Strategies

1. **Merge to `dev`**:

   - Use "Squash and merge" for feature branches to keep history clean.
   - Resolve conflicts locally if they occur.

2. **Merge to `main`**:
   - Use "Create a merge commit" to preserve the full history.
   - Only merge `dev` to `main` after thorough testing and approval.

### Commands

```bash
# Merge feature to dev (after PR approval)
git checkout dev
git pull origin dev
git merge --no-ff feat/your-feature-name
git push origin dev

# Merge dev to main (after testing)
git checkout main
git pull origin main
git merge --no-ff dev
git push origin main
```

## Best Practices

### General

- Keep branches short-lived (ideally 1-3 days for features).
- Regularly sync your branches with the upstream:
  ```bash
  git checkout dev
  git pull origin dev
  git checkout feat/your-branch
  git rebase dev  # Or merge if preferred
  ```
- Use `git rebase` for linear history, but avoid rebasing public branches.
- Delete merged branches:
  ```bash
  git branch -d feat/your-feature-name
  git push origin --delete feat/your-feature-name
  ```

### Code Quality

- Run tests before committing: `npm test` or equivalent.
- Format code according to project standards (Ultracite/Biome).
- Ensure linting passes: `npx ultracite check`.
- Write meaningful commit messages that explain the "why" not just the "what".

### Collaboration

- Communicate with the team about large changes.
- Use GitHub issues for tracking work.
- Avoid force-pushing to shared branches.
- Review code thoroughly in PRs.

## Troubleshooting

### Common Issues

- **Merge conflicts**: Resolve locally, test thoroughly, then push.
- **Accidental commits**: Use `git reset --soft HEAD~1` to undo.
- **Lost commits**: Check `git reflog` to recover.
- **Branch naming conflicts**: Use unique, descriptive names.

### Getting Help

- Check the Git documentation: `git help <command>`
- Use `git status` and `git log` frequently to understand your state.
- For complex scenarios, consult with team leads.

## Tools and Automation

- Use VS Code's Git integration for easier branching and committing.
- Consider Git hooks for pre-commit checks (e.g., linting, testing).
- Integrate with CI/CD for automated testing and deployment.

Remember: A good Git workflow is about communication and consistency. When in doubt, ask the team!
