#!/usr/bin/env python3
"""Gối Sách explainer: renderer whiteboard với nền giấy xám (như video mẫu) và bàn tay dài của Gối Sách."""
import os
import sys
from dataclasses import replace
from pathlib import Path

sys.path.insert(0, os.environ.get('WB_SRT_SCRIPTS') or 'C:/Users/HOANGDV/tools/srt-whiteboard-animation/scripts')
import render_stream_whiteboard as whiteboard

original_build_cfg = whiteboard._build_cfg


def build_cfg(args):
    return replace(original_build_cfg(args), target_hand_height=1862, canvas_hex='#EDEDEB')


whiteboard._build_cfg = build_cfg
if __name__ == '__main__':
    raise SystemExit(whiteboard.main())
