export const SCREEN_TOOL_DEFINITIONS = [
  {
    name: 'capture_full_screen',
    description:
      "Capture a screenshot of the user's entire screen. Use this whenever the user asks you to look at, read, or help with something on their screen — including emails, documents, web pages, code, chat messages, forms, or any other visible content. The returned image contains the full screen rendered at the time of capture. You must read and analyze ALL visible text and UI elements in the image in detail, including the content of open applications, browser tabs, emails, and documents. Never say you cannot read text from an image — you have full vision capabilities and must extract and reason over all on-screen content.",
    parameters: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'capture_region',
    description:
      'Capture a screenshot of a specific rectangular region of the screen. Use this instead of capture_full_screen when you already know the area of interest — it is faster and returns a smaller, more focused image. Coordinates must be in logical screen points, matching the values from click_at.',
    parameters: {
      type: 'object',
      properties: {
        x: {
          type: 'number',
          description: 'Left edge of the region in screen points.'
        },
        y: {
          type: 'number',
          description: 'Top edge of the region in screen points.'
        },
        width: {
          type: 'number',
          description: 'Width of the region in screen points.'
        },
        height: {
          type: 'number',
          description: 'Height of the region in screen points.'
        }
      },
      required: ['x', 'y', 'width', 'height']
    }
  },
  {
    name: 'click_at',
    description:
      "Click the mouse at specific screen coordinates on the user's Mac. Use after capture_full_screen to interact with UI elements. Supports left click, right click, and double click.",
    parameters: {
      type: 'object',
      properties: {
        x: {
          type: 'number',
          description: 'Horizontal screen coordinate in pixels.'
        },
        y: {
          type: 'number',
          description: 'Vertical screen coordinate in pixels.'
        },
        button: {
          type: 'string',
          description: 'Mouse button: "left" (default) or "right".'
        },
        count: {
          type: 'integer',
          description: 'Number of clicks: 1 (default) or 2 for double-click.'
        }
      },
      required: ['x', 'y']
    }
  },
  {
    name: 'move_mouse',
    description: 'Move the mouse cursor to specific screen coordinates without clicking.',
    parameters: {
      type: 'object',
      properties: {
        x: {
          type: 'number',
          description: 'Horizontal screen coordinate in pixels.'
        },
        y: {
          type: 'number',
          description: 'Vertical screen coordinate in pixels.'
        }
      },
      required: ['x', 'y']
    }
  },
  {
    name: 'type_text',
    description:
      'Type text at the current cursor position as if typed on a keyboard. Use after clicking the target input field.',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The text to type.'
        }
      },
      required: ['text']
    }
  },
  {
    name: 'key_press',
    description:
      'Press a keyboard key, optionally with modifier keys (command, shift, option, control). Use for shortcuts like Cmd+C, Cmd+V, Enter, Escape, arrow keys, etc.',
    parameters: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description:
            'Key to press. Named keys: return, tab, space, delete, escape, left, right, up, down, f1-f12, home, end, pageup, pagedown. Or a single character like "a", "c", "v".'
        },
        modifiers: {
          type: 'array',
          items: {
            type: 'string'
          },
          description:
            'Modifier keys to hold: "command" (or "cmd"), "shift", "option" (or "alt"), "control" (or "ctrl").'
        }
      },
      required: ['key']
    }
  },
  {
    name: 'scroll',
    description:
      'Scroll at specific screen coordinates. Positive deltaY scrolls up, negative scrolls down.',
    parameters: {
      type: 'object',
      properties: {
        x: {
          type: 'number',
          description: 'Horizontal screen coordinate.'
        },
        y: {
          type: 'number',
          description: 'Vertical screen coordinate.'
        },
        deltaX: {
          type: 'number',
          description: 'Horizontal scroll amount (default 0).'
        },
        deltaY: {
          type: 'number',
          description:
            'Vertical scroll amount. Negative = scroll down, positive = scroll up. Default -3.'
        }
      },
      required: ['x', 'y']
    }
  },
  {
    name: 'drag',
    description: 'Click and drag from one screen coordinate to another.',
    parameters: {
      type: 'object',
      properties: {
        fromX: {
          type: 'number',
          description: 'Start X coordinate.'
        },
        fromY: {
          type: 'number',
          description: 'Start Y coordinate.'
        },
        toX: {
          type: 'number',
          description: 'End X coordinate.'
        },
        toY: {
          type: 'number',
          description: 'End Y coordinate.'
        }
      },
      required: ['fromX', 'fromY', 'toX', 'toY']
    }
  },
  {
    name: 'get_mouse_position',
    description: 'Get the current mouse cursor position on screen.',
    parameters: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_ui_elements',
    description:
      'Inspect the macOS Accessibility tree of the frontmost app (or a named app) and return every visible UI element with its role, label, position (x, y), and size (w, h). Use this INSTEAD of screenshot-based coordinate guessing when you need to click a specific button, text field, menu item, or link — find the element by its label, then pass its center coordinates (x + w/2, y + h/2) to click_at. This is faster and more reliable than clicking by pixel.',
    parameters: {
      type: 'object',
      properties: {
        app: {
          type: 'string',
          description:
            'Name of the macOS app process to inspect (e.g. "Safari", "Mail", "Finder"). If omitted, inspects whichever app is currently in the foreground.'
        },
        maxElements: {
          type: 'integer',
          description: 'Maximum number of UI elements to return (default 200, max 1000).'
        }
      }
    }
  },
  {
    name: 'clipboard_read',
    description: 'Read the current text content of the system clipboard.',
    parameters: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'clipboard_write',
    description: 'Write text to the system clipboard, replacing its current content.',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to place on the clipboard.'
        }
      },
      required: ['text']
    }
  },
  {
    name: 'focus_app',
    description:
      'Bring a macOS application to the foreground. Use before interacting with an app that may be in the background.',
    parameters: {
      type: 'object',
      properties: {
        app: {
          type: 'string',
          description:
            'Application name as it appears in /Applications (e.g. "Safari", "Finder", "Visual Studio Code").'
        }
      },
      required: ['app']
    }
  },
  {
    name: 'launch_app',
    description: 'Launch a macOS application, opening it if not already running.',
    parameters: {
      type: 'object',
      properties: {
        app: {
          type: 'string',
          description: 'Application name (e.g. "Terminal", "Xcode").'
        },
        args: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Optional arguments to pass to the application.'
        }
      },
      required: ['app']
    }
  },
  {
    name: 'list_apps',
    description: "List all installed applications in /Applications on the user's Mac.",
    parameters: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'acquire_screen',
    description:
      'Claim exclusive screen control for the current agent session. Call this before starting a multi-step screen automation task to prevent other agents from interfering. The lock auto-expires after 30s of screen inactivity. Always pair with release_screen when done. Use force=true to break a stuck lock from a dead session.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Unique identifier for this agent session.'
        },
        force: {
          type: 'boolean',
          description:
            'Override an existing lock held by another session. Use only when a previous session is known to be dead.'
        }
      },
      required: ['sessionId']
    }
  },
  {
    name: 'release_screen',
    description: 'Release the screen control lock acquired with acquire_screen.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'The session ID used in acquire_screen.'
        }
      },
      required: ['sessionId']
    }
  }
]
