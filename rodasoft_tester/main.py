#!/usr/bin/env python3
"""
Rodasoft Device Capability Verification Tool
Main Entry Point

This application verifies the real capabilities of Rodasoft biometric devices
before integration into Project Z.

Usage:
    python main.py
"""

import sys
import os

# Ensure the application directory is on the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ui.main_window import main

if __name__ == "__main__":
    main()
