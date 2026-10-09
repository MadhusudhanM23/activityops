# Deploying ActivityOps on AWS

Spec v7 sec. 18: **one EC2 instance + an encrypted EBS volume + Docker Compose + an HTTPS reverse
proxy (Caddy)**. App Runner is ruled out because its filesystem is ephemeral and SQLite is the
authoritative store.

> **Status:** the container image, Compose stack and hardening have been built and tested locally
> (Docker Desktop). The AWS steps below have **not yet been executed** — no AWS account was available
> to this build (blocker B-002). Treat this as a runbook to verify, not a record of a deployment.

```
Internet ──443──▶ Caddy (TLS, automatic certificates) ──▶ activityops-app:8080 ──▶ /data (encrypted EBS)
                                                                     │
                                       IAM instance role ────────────┼──▶ Secrets Manager (DEMO_PASSWORD)
                                                                     └──▶ Amazon Bedrock (Phase 5)
```

## 1. Secret

Create a Secrets Manager secret named `activityops/production`, as JSON:

```json
{ "DEMO_PASSWORD": "<12+ characters, not the development value>" }
```

The app **refuses to start** in production without a strong `DEMO_PASSWORD` — this is tested.

## 2. IAM instance role

Attach a role to the instance (no access keys anywhere on the host) with:

- `secretsmanager:GetSecretValue` on the `activityops/production` secret ARN only;
- `AmazonSSMManagedInstanceCore`, so the host is reached through Session Manager instead of SSH;
- for the AI copilot: `bedrock:InvokeModel` **and** `bedrock:InvokeModelWithResponseStream` on the
  one model (or inference profile) chosen in Day-1 T9. The Strands runtime uses the streaming
  Converse API, which needs the second action; the `bedrock-converse` fallback needs only the first.
  The first invocation of an Anthropic model may also need `aws-marketplace:ViewSubscriptions` and
  `aws-marketplace:Subscribe` (spec sec. 0A) — verify in T9.

The app never holds AWS keys: the AWS SDK picks up the instance role automatically. To enable the
copilot, add to `.env.production` (not secrets — plain configuration):

```
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=<model or inference-profile id verified with npm run ai:smoke>
```

Without them the copilot stays off and the rest of the app is unaffected.

## 3. Instance and network

- Amazon Linux 2023, `t3.small` is enough for a single-node demo.
- Security group: inbound **80 and 443 only**. No port 22 — use Session Manager.
- Allocate an Elastic IP and point the demo hostname's `A` record at it.

## 4. Encrypted EBS volume

Create a **gp3 volume with encryption enabled** in the instance's availability zone (8 GiB is ample),
attach it, then on the host:

```bash
sudo mkfs -t xfs /dev/nvme1n1                      # confirm the device name with lsblk first
sudo mkdir -p /mnt/activityops-data
echo '/dev/nvme1n1 /mnt/activityops-data xfs defaults,nofail 0 2' | sudo tee -a /etc/fstab
sudo mount -a
# The container runs as the unprivileged "node" user (uid 1000). A bind mount keeps
# host ownership, so without this SQLite cannot create its database or WAL files.
sudo chown 1000:1000 /mnt/activityops-data
```

Schedule daily snapshots with **Amazon Data Lifecycle Manager** — that is the backup and rebuild path.

## 5. Run

```bash
sudo dnf install -y docker git jq && sudo systemctl enable --now docker
sudo mkdir -p /usr/local/lib/docker/cli-plugins
# install the Docker Compose v2 plugin per the Docker documentation, then:
git clone https://github.com/MadhusudhanM23/activityops.git && cd activityops
AWS_REGION=<region> ./deploy/fetch-secrets.sh          # writes .env.production, owner-only
export ACTIVITYOPS_DOMAIN=<demo hostname>
export ACTIVITYOPS_DATA_DIR=/mnt/activityops-data
sudo -E docker compose up -d --build
```

The app container runs with a read-only root filesystem, all Linux capabilities dropped and
`no-new-privileges`; only `/data` (EBS) and `/tmp` (tmpfs) are writable.

## 6. Verify

```bash
curl -fsS https://<domain>/api/health                # {"status":"ok",...}
curl -sI  https://<domain>/ | grep -i strict-transport-security
curl -s -o /dev/null -D - https://<domain>/api/session/login \
  -H 'content-type: application/json' -d '{"username":"demo.operator","password":"<password>"}' \
  | grep -i set-cookie                                # must show HttpOnly; Secure; SameSite=Strict
```

Then open the site anonymously: Review Mode must load without signing in.

## 7. Logs (CloudWatch)

Application logs never contain Ring tokens, passwords, session ids, CSRF tokens or request bodies —
asserted by a test that captures real log output. They can be shipped with the Docker `awslogs` log
driver or the CloudWatch agent.

## 8. Update and roll back

```bash
git pull && sudo -E docker compose up -d --build     # update
git checkout <previous tag> && sudo -E docker compose up -d --build   # roll back
```

The database lives on EBS, outside the container, so neither operation touches data. Restore from
an EBS snapshot only for data loss.
