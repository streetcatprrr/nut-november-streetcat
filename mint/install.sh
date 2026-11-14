#!/usr/bin/env bash
# A test mint with the `dest` rule on a small server of your own: Nutshell 0.21.0, the patch beside this file, a fake
# Lightning backend (no real money: its invoices pay themselves), behind Caddy for HTTPS, kept running by systemd.
#
#   sudo bash mint/install.sh mint.example.org
#
# For a fresh Debian 12 or Ubuntu 24.04 server (Python 3.10 to 3.12), 1 GB of memory is enough. Before running it, point
# the name at the server (a DNS A record) and leave ports 80 and 443 open: Caddy asks Let's Encrypt for the certificate.
# Run it again after pulling a newer patch: it installs the mint's code afresh and keeps the mint's key and its database.
#
# The mint's private key is made here, on the server, and written to /etc/nutshell-dest/env, which only root and the
# mint's own user can read. It is never printed. Whoever has that file can sign ecash as this mint: back it up like a key.
#
# It refuses to set up anything but the fake backend. The patch is an experiment that nobody outside this project has
# reviewed (see mint/README.md): do not put real funds behind it.
set -euo pipefail

DOMAIN="${1:-}"; NAME="${MINT_NAME:-Streetcat TEST mint (fake money)}"; PORT="${MINT_PORT:-3338}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; PATCH="$HERE/nutshell-0.21.0-dest.patch"
APP=/opt/nutshell-dest; DATA=/var/lib/nutshell-dest; ETC=/etc/nutshell-dest; USERNAME=nutshell-dest
say() { printf '\n== %s\n' "$*"; }; die() { printf '\nNot done: %s\n' "$*" >&2; exit 1; }

# --- checks: begin ---  (tests/static_test.mjs runs what is between the two marks on its own)
# What comes from outside is written into the mint's settings, its service and Caddy's file, each value on a line of its own,
# so it is taken only whole and plain (14 Nov: a MINT_NAME with a line break in it wrote settings of its own into the mint's
# file, a backend among them; a domain or a port could do the same in the other two files).
domain_ok() { local re='^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$'; [[ $1 =~ $re ]]; }
name_ok() { local re='^[^[:cntrl:]"\\`$]{1,80}$'; [[ $1 =~ $re ]]; }
port_ok() { local re='^[1-9][0-9]{0,4}$'; [[ $1 =~ $re ]] && (( $1 <= 65535 )); }
# the mint's settings, as this script writes them the first time (the key is made here, and never printed)
settings() {
  echo "# The mint's settings. MINT_PRIVATE_KEY is this mint's key: keep a copy of this file somewhere safe."
  echo "MINT_PRIVATE_KEY=$(openssl rand -hex 32)"
  echo "MINT_BACKEND_BOLT11_SAT=FakeWallet"
  echo "FAKEWALLET_BRR=TRUE"
  echo "MINT_DATABASE=$DATA/data"
  echo "MINT_LISTEN_HOST=127.0.0.1"
  echo "MINT_LISTEN_PORT=$PORT"
  echo "MINT_INPUT_FEE_PPK=0"
  echo "MINT_MAX_WITNESS_LENGTH=65536"
  echo "MINT_INFO_NAME=\"$NAME\""
  echo "MINT_INFO_DESCRIPTION=\"Test mint with the experimental dest rule. Fake money: nothing here has any value.\""
  echo "MINT_RATE_LIMIT=TRUE"
  echo "MINT_GLOBAL_RATE_LIMIT_PER_MINUTE=120"
  echo "MINT_TRANSACTION_RATE_LIMIT_PER_MINUTE=40"; }
# They may set up no Lightning backend but the fake one, read as systemd and Nutshell read them (14 Nov: a second backend line
# further down, which systemd takes; MINT_LIGHTNING_BACKEND, Nutshell's old name, which wins over the new one; or a name in lower
# case, which Nutshell reads too: all passed a check that looked only for the fake line). Every line must be one this reads
# whole: blank, a comment, or NAME=value with the name in capitals and the value plain (no space, quote or backslash) or in
# double quotes closed on the same line. MINT_BACKEND_BOLT11_SAT is there once, and every backend it names is the fake one.
fake_only() { local line='^([#;].*|[A-Z][A-Z0-9_]*=([^[:space:][:cntrl:]"'\''\\]*|"[^[:cntrl:]"\\]*"))?$'
  [ -f "$1" ] && ! LC_ALL=C grep -Evq "$line" "$1" && [ "$(grep -c '^MINT_BACKEND_BOLT11_SAT=' "$1")" = 1 ] \
    && ! grep -E '^(MINT_BACKEND_[A-Z0-9_]+|MINT_LIGHTNING_BACKEND)=' "$1" | grep -Evqx '[A-Z0-9_]+=(FakeWallet|"FakeWallet")'; }
# Nutshell also reads a .env in the folder it runs in, or else one in .cashu in its home, over what systemd hands it
stray_env() { local f; for f in "$1/.env" "$2/.cashu/.env"; do [ ! -e "$f" ] || { echo "$f"; return 1; }; done; }
# --- checks: end ---

[ "$(id -u)" = 0 ] || die "run it as root (sudo bash mint/install.sh mint.example.org)"
domain_ok "$DOMAIN" || die "give the mint's name, in lower case: sudo bash mint/install.sh mint.example.org"
name_ok "$NAME" || die "MINT_NAME: one line of up to 80 characters, with no quotes, backslashes, \$ or \`"
port_ok "$PORT" || die "MINT_PORT: a port number, from 1 to 65535"
[ -f "$PATCH" ] || die "the patch is not beside this file ($PATCH)"
command -v apt-get >/dev/null || die "this is written for Debian and Ubuntu (apt-get was not found)"

say "Packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q python3 python3-venv python3-pip patch curl openssl caddy
python3 -c 'import sys; sys.exit(0 if (3, 10) <= sys.version_info[:2] <= (3, 12) else 1)' \
  || die "Nutshell 0.21.0 installs cleanly on Python 3.10 to 3.12; this server has $(python3 -V). See tests/README.md for 3.13."

say "The mint's user and folders"
id "$USERNAME" >/dev/null 2>&1 || useradd --system --home-dir "$DATA" --shell /usr/sbin/nologin "$USERNAME"
install -d -m 755 "$APP"; install -d -m 750 -o "$USERNAME" -g "$USERNAME" "$DATA"; install -d -m 750 -o root -g "$USERNAME" "$ETC"

say "Nutshell 0.21.0 and the patch"
[ -x "$APP/venv/bin/python" ] || python3 -m venv "$APP/venv"
"$APP/venv/bin/pip" install -q --upgrade pip
# Nutshell 0.21.0 asks for breez-sdk-spark 0.17, which PyPI no longer has (its oldest is 0.21.1, 13 Nov), so a plain
# `pip install cashu==0.21.0` stops. The mint imports breez-sdk-spark as it starts, but a mint on the fake backend never
# uses it: its other dependencies go in as 0.21.0 lists them, with the oldest breez-sdk-spark there is, then the mint
# without its own list (checked on Python 3.12: it starts and announces the rule). limits and marshmallow stay below 4.
REQ="$(mktemp)"; cat > "$REQ" <<'REQS'
SQLAlchemy[asyncio]>=2.0.35,<3.0.0
aiosqlite>=0.20.0,<0.21.0
asyncpg>=0.30.0,<0.31.0
bech32>=1.2.0,<2.0.0
bip32>=4.0,<5.0
bitstring>=3.1.9,<4.0.0
bolt11>=2.0.5,<3.0.0
breez-sdk-spark==0.21.1
brotli>=1.1.0,<2.0.0
cbor2>=5.6.2,<6.0.0
click>=8.1.7,<9.0.0
cryptography>=43.0.1,<44.0.0
ecdsa>=0.19.0,<0.20.0
environs>=9.5.0,<10.0.0
fastapi>=0.115.0,<0.116.0
googleapis-common-protos>=1.63.2,<2.0.0
greenlet>=3.0.0
grpcio>=1.65.1,<2.0.0
grpcio-tools>=1.65.1,<2.0.0
h11>=0.14.0,<0.15.0
httpx[socks]>=0.25.1,<0.26.0
importlib-metadata>=6.8.0,<7.0.0
jinja2>=3.1.5,<4.0.0
limits<4
loguru>=0.7.0,<0.8.0
marshmallow<4
mnemonic>=0.20,<0.21
mypy-protobuf>=3.6.0,<4.0.0
pycryptodomex>=3.16.0,<4.0.0
pydantic>=2.5.3,<3.0.0
pydantic-settings>=2.1.0,<3.0.0
pyjwt>=2.9.0,<3.0.0
redis>=5.1.1,<6.0.0
setuptools>=75.1.0,<76.0.0
slowapi>=0.1.9,<0.2.0
types-protobuf>=5.27.0.20240626,<6.0.0.0
uvicorn>=0.31.0,<0.32.0
websocket-client>=1.3.3,<2.0.0
websockets>=12.0,<13.0
wheel>=0.41.1,<0.42.0
zstandard>=0.23.0,<0.24.0
REQS
"$APP/venv/bin/pip" install -q -r "$REQ" || { rm -f "$REQ"; die "Nutshell's dependencies did not install"; }
rm -f "$REQ"
"$APP/venv/bin/pip" install -q --no-deps 'cashu==0.21.0'
# the patch goes on a copy; the installed package stays as it came, so a second run starts from clean code
SRC="$("$APP/venv/bin/python" -c 'import cashu, os; print(os.path.dirname(cashu.__file__))')"
NEW="$(mktemp -d "$APP/new.XXXXXX")"; cp -r "$SRC" "$NEW/cashu"
patch -p1 -s -d "$NEW" < "$PATCH" || die "the patch did not apply to the installed Nutshell (is it 0.21.0?)"
PYTHONPATH="$NEW" "$APP/venv/bin/python" - <<'PY' || die "the patched mint does not load"
import cashu.mint.dest, inspect, cashu.mint.features as f
assert "LedgerDestConditions" in dir(cashu.mint.dest) and cashu.mint.dest.DEST_POLICIES
assert "dest=DEST_POLICIES" in inspect.getsource(f), "the mint would not announce the rule"
PY
if [ -d "$APP/cashu" ]; then OLD="$APP/old.$(date +%s)"; mv "$APP/cashu" "$OLD"; fi
mv "$NEW/cashu" "$APP/cashu"; rmdir "$NEW"; chmod -R a+rX "$APP/cashu"

say "Settings"
if [ -f "$ETC/env" ]; then echo "kept as they are: $ETC/env (the mint's key is in it)"
else
  umask 027
  settings > "$ETC/env"
  chown root:"$USERNAME" "$ETC/env"; chmod 640 "$ETC/env"; umask 022
fi
fake_only "$ETC/env" || die "$ETC/env sets up a backend that is not the fake one, or has a line this script cannot read whole (NAME=value, the name in capitals, the value plain or in double quotes on its line): this script does not set up a mint with real funds"
STRAY="$(stray_env "$DATA" "$(getent passwd "$USERNAME" | cut -d: -f6)")" || die "$STRAY is there: Nutshell would read it over $ETC/env. Move it away, then run this again"

say "The service"
cat > /etc/systemd/system/nutshell-dest.service <<UNIT
[Unit]
Description=Nutshell 0.21.0 test mint with the dest rule (fake money)
After=network-online.target
Wants=network-online.target

[Service]
User=$USERNAME
Group=$USERNAME
WorkingDirectory=$DATA
Environment=PYTHONPATH=$APP
EnvironmentFile=$ETC/env
ExecStart=$APP/venv/bin/python -m cashu.mint --host 127.0.0.1 --port $PORT
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$DATA

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable -q nutshell-dest
systemctl restart nutshell-dest
for _ in $(seq 30); do curl -fsS -m 2 "http://127.0.0.1:$PORT/v1/info" >/dev/null 2>&1 && break; sleep 1; done
curl -fsS -m 5 "http://127.0.0.1:$PORT/v1/info" | grep -q '"dest"' \
  || die "the mint did not come up with the rule: journalctl -u nutshell-dest -n 50"

say "HTTPS (Caddy)"
if grep -q "^$DOMAIN " /etc/caddy/Caddyfile 2>/dev/null; then echo "already in /etc/caddy/Caddyfile"
else printf '\n%s {\n\treverse_proxy 127.0.0.1:%s\n}\n' "$DOMAIN" "$PORT" >> /etc/caddy/Caddyfile; fi
systemctl enable -q caddy
systemctl reload caddy 2>/dev/null || systemctl restart caddy

say "Done"
if curl -fsS -m 20 "https://$DOMAIN/v1/info" 2>/dev/null | grep -q '"dest"'; then echo "The mint answers at https://$DOMAIN and announces the rule."
else echo "The mint runs on this server. https://$DOMAIN does not answer yet: check that the name points here and that"
     echo "ports 80 and 443 are open, then look again in a minute (curl https://$DOMAIN/v1/info)."; fi
echo "Logs: journalctl -u nutshell-dest -f     Settings and the mint's key: $ETC/env     Database: $DATA"
[ -n "${OLD:-}" ] && echo "The code of before is in $OLD; delete it once this one has run for a while."
exit 0
