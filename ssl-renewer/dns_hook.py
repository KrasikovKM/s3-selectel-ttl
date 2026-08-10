#!/usr/bin/env python3
# acme.sh DNS-01 hook for Selectel new DNS (dnsv2). Usage: dns_hook.py add|rm <fulldomain> <txtvalue>
import sys, json, urllib.request, urllib.error

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
        r = urllib.request.urlopen(req, timeout=30)
        b = r.read().decode()
        return r.status, (json.loads(b) if b.strip() else None)
    except urllib.error.HTTPError as e:
        raise SystemExit("API %s %s -> %s %s" % (method, url, e.code, e.read().decode()[:300]))


def find_zone(tok, fqdn):
    _, d = api("GET", CFG["dns_api"] + "/zones?limit=1000", tok)
    fqdn = fqdn.rstrip(".") + "."
    best = None
    for z in d.get("result", []):
        zn = z["name"]
        if fqdn == zn or fqdn.endswith("." + zn):
            if best is None or len(zn) > len(best["name"]):
                best = z
    if not best:
        raise SystemExit("zone not found for " + fqdn)
    return best


def get_rrset(tok, zid, name):
    _, d = api("GET", CFG["dns_api"] + "/zones/%s/rrset?limit=1000" % zid, tok)
    for rr in d.get("result", []):
        if rr["name"] == name and rr["type"] == "TXT":
            return rr
    return None


def main():
    cmd, fulldomain, txt = sys.argv[1], sys.argv[2], sys.argv[3]
    name = fulldomain.rstrip(".") + "."
    content = '"%s"' % txt
    tok = token()
    zone = find_zone(tok, fulldomain)
    zid = zone["id"]
    rr = get_rrset(tok, zid, name)
    if cmd == "add":
        contents = {r["content"] for r in rr["records"]} if rr else set()
        contents.add(content)
        if rr:
            api("DELETE", CFG["dns_api"] + "/zones/%s/rrset/%s" % (zid, rr["id"]), tok)
        api("POST", CFG["dns_api"] + "/zones/%s/rrset" % zid, tok,
            {"name": name, "type": "TXT", "ttl": 60, "records": [{"content": c} for c in contents]})
        print("added", name)
    elif cmd == "rm":
        if not rr:
            return
        remain = [{"content": r["content"]} for r in rr["records"] if r["content"] != content]
        api("DELETE", CFG["dns_api"] + "/zones/%s/rrset/%s" % (zid, rr["id"]), tok)
        if remain:
            api("POST", CFG["dns_api"] + "/zones/%s/rrset" % zid, tok,
                {"name": name, "type": "TXT", "ttl": 60, "records": remain})
        print("removed", name)


main()
