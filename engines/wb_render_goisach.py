#!/usr/bin/env python3
"""Goi Sach adapter: use the installed whiteboard renderer with a taller hand asset."""
import sys
from dataclasses import replace
from pathlib import Path

renderer_dir = Path('C:/Users/HOANGDV/tools/srt-whiteboard-animation/scripts')
sys.path.insert(0, str(renderer_dir))
import render_stream_whiteboard as whiteboard

original_build_cfg = whiteboard._build_cfg

def build_cfg(args):
    return replace(original_build_cfg(args), target_hand_height=1862)

whiteboard._build_cfg = build_cfg
if __name__ == '__main__':
    raise SystemExit(whiteboard.main())
