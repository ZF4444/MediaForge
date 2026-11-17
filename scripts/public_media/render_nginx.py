"""Render a reviewable configuration file; never installs or reloads Nginx."""

import argparse
import ipaddress
import re
from pathlib import Path


def render(values, mode="auto"):
    values = dict(values)
    for key, value in values.items():
        if not re.fullmatch(r"[a-zA-Z0-9._/:\-]+", value):
            raise ValueError(f"Invalid template value: {key}")
    try:
        address = ipaddress.ip_address(values["HOST"])
    except ValueError:
        address = None
    if mode not in ("auto", "ip", "domain"):
        raise ValueError("Unknown entrance mode")
    if mode == "ip" and address is None:
        raise ValueError("IP mode requires a literal IPv4 or IPv6 address without brackets or port")
    ip_mode = mode == "ip" or (mode == "auto" and address is not None)
    if not ip_mode and (address is not None or not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9.-]*", values["HOST"])):
        raise ValueError("Domain mode requires a DNS hostname")
    if ip_mode:
        values["HOST"] = str(address)
        host = f"[{address}]" if address.version == 6 else str(address)
        values["HOST_PATTERN"] = re.escape(host)
    filename = "nginx-ip.conf.template" if ip_mode else "nginx.conf.template"
    template = (Path(__file__).resolve().parents[2] / "config/deploy/public-media" / filename).read_text()
    for key, value in values.items():
        template = template.replace(f"@{key}@", value)
    if re.search(r"@[A-Z_]+@", template):
        raise ValueError("Unresolved template variable")
    return template


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for argument in ("listen", "host", "cert", "key", "upstream", "access-log"):
        parser.add_argument("--" + argument, required=True)
    parser.add_argument("--mode", choices=("auto", "ip", "domain"), default="auto")
    args = vars(parser.parse_args())
    mode = args.pop("mode")
    print(render({name.upper(): value for name, value in args.items()}, mode))
