# EVKO Autodeploy

The repository includes an automatic deploy path for the production VM.

## Files

- `scripts/deploy.sh` updates the local checkout to `origin/main`, syncs submodules and rebuilds Docker containers.
- `scripts/check-and-deploy.sh` checks whether `origin/main` changed and only deploys when a new commit appears.
- `scripts/install-autodeploy.sh` installs a `systemd` timer called `evko-autodeploy.timer`.
- `.github/workflows/verify.yml` runs backend tests and frontend lint/build on GitHub for pushes and pull requests.

## Server behavior

After installation, the VM checks `origin/main` once per minute and runs:

```bash
docker compose up -d --build --remove-orphans
```

This means new commits in `main` are usually deployed within about a minute.

## Manual commands

Deploy immediately:

```bash
./scripts/deploy.sh
```

Install or reinstall the timer:

```bash
./scripts/install-autodeploy.sh
```

Check timer state:

```bash
sudo systemctl status evko-autodeploy.timer
```

Check deploy logs:

```bash
journalctl -u evko-autodeploy.service -n 100 --no-pager
```
