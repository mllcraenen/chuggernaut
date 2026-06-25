# Deployment

## tools.marijncraenen.nl

Live at https://tools.marijncraenen.nl

### Infrastructure

- Docker container on port 3001
- Caddy reverse proxy with automatic TLS (Let's Encrypt)
- Caddy config: `/etc/caddy/Caddyfile`

### Start / update

```bash
sudo docker compose up -d --build
sudo systemctl reload caddy
```

### Credentials

Stored in `~/projects/tools-portal/.env` (not committed). See `.env.example`.
