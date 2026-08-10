#!/usr/bin/env python3
# Upload issued cert to Selectel S3 custom-domain SSL, then delete superseded certs.
# Standalone: upload.py <fullchain.pem> <key.pem>
# As acme.sh --renew-hook: reads CERT_FULLCHAIN_PATH / CERT_KEY_PATH from env.
import sys, os, json, time, subprocess, urllib.request, urllib.error

CFG = json.load(open("/opt/ssl-renewer/creds.json"))


def token():
    p = {"auth": {"identity": {"methods": ["password"], "password": {"user": {
        "name": CFG["user"], "domain": {"name": CFG["account"]}, "password": CFG["password"]}}},
        "scope": {"project": {"id": CFG["project_id"]}}}}
    req = urllib.request.Request(CFG["auth_url"], data=json.dumps(p).encode(),
                                 headers={"Content-Type": "application/json"})
    return urllib.request.urlopen(req, timeout=30).headers.get("X-Subject-Token")


def api(method, url, tok, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"X-Auth-Token": tok, "Content-Type": "application/json"})
    try:
        r = urllib.request.urlopen(req, timeout=60)
        b = r.read().decode()
        return r.status, (json.loads(b) if b.strip() else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:400]


def main():
    fc = os.environ.get("CERT_FULLCHAIN_PATH") or sys.argv[1]
    key = os.environ.get("CERT_KEY_PATH") or sys.argv[2]
    cert = open(fc).read()
    pk8 = subprocess.check_output(["openssl", "pkcs8", "-topk8", "-nocrypt", "-in", key]).decode()

    tok = token()
    name = "ssl_auto_%d" % int(time.time())
    st, d = api("POST", CFG["ssl_api"], tok, {"name": name, "certificate": cert, "private_key": pk8})
    if st not in (200, 201) or not isinstance(d, dict) or "id" not in d:
        raise SystemExit("UPLOAD FAILED %s %s" % (st, d))
    newid = d["id"]
    print("uploaded id=%s name=%s domains=%s" % (newid, name, d.get("domains")))

    want = set(CFG["domains"])
    st, lst = api("GET", CFG["ssl_api"], tok)
    if isinstance(lst, list):
        for c in lst:
            if c.get("id") == newid:
                continue
            if set(c.get("domains", [])) == want:
                dst, _ = api("DELETE", CFG["ssl_api"] + "/" + c["id"], tok)
                print("deleted old id=%s name=%s -> %s" % (c["id"], c.get("name"), dst))


main()
