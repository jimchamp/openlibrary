#!/usr/bin/env python
"""
Simulates DB traffic by updating random `store` and `store_index` entries
"""
import argparse
import random
import time

import infogami
import web

from openlibrary.core import db
from openlibrary.setup import setup_for_script
from scripts.utils.graceful_shutdown import init_signal_handler, was_shutdown_requested

DEFAULT_CONFIG_PATH = "conf/openlibrary.yml"
MIN_TEST_OBJ_ID = 0
MAX_TEST_OBJ_ID = 836046

def init(conf_path):
    init_signal_handler()
    setup_for_script(conf_path)
    web.ctx.ip = web.ctx.ip or "127.0.0.1"

def update_store_object(key, value=None):
    v = value or random.randint(0, 100_000_000)
    d = web.ctx.site.store[key]
    d["value"] = v
    d["_rev"] = None
    web.ctx.site.store[key] = d

def main(args):
    init(args.config)

    while not was_shutdown_requested():
        # Get count of txns this second
        txn_cnt = random.randint(0, 4)

        # Get random keys
        key_set = set()
        while len(key_set) < txn_cnt:
            key_set.add(f"test/{random.randint(MIN_TEST_OBJ_ID, MAX_TEST_OBJ_ID)}")

        # Update objects with random values
        for key in key_set:
            update_store_object(key)

        # Wait one second
        time.sleep(1)

def _parse_args():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "-c",
        "--config",
        default=DEFAULT_CONFIG_PATH,
        help="Path to openlibrary configuration yaml"
    )
    p.set_defaults(func=main)
    return p.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    args.func(args)
