import sys
from playwright.sync_api import sync_playwright

def main():
    base_url = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:5173'
    routes = ['/', '/task-board', '/video-match', '/video-analysis']
    
    print(f"Starting headless browser check at base URL: {base_url}")
    
    warnings = []
    errors = []
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        
        for route in routes:
            url = f"{base_url}{route}"
            print(f"  Checking {url} ...")
            page = browser.new_page()
            
            def handle_console(msg):
                text = msg.text
                if '[vite]' in text:
                    return
                if msg.type in ('warning', 'warn'):
                    if '[Vue warn]' in text or 'warning' in text.lower():
                        warnings.append(f"[{route}] {text}")
                elif msg.type == 'error':
                    errors.append(f"[{route}] {text}")
                    
            def handle_pageerror(err):
                errors.append(f"[{route}] {err.message}")
                
            page.on("console", handle_console)
            page.on("pageerror", handle_pageerror)
            
            page.add_init_script("""
                window.addEventListener('unhandledrejection', event => {
                    const msg = event.reason && event.reason.message ? event.reason.message : String(event.reason);
                    console.error('Unhandled Promise Rejection: ' + msg);
                });
            """)
            
            try:
                page.goto(url, wait_until="networkidle", timeout=15000)
                page.wait_for_timeout(2000)
            except Exception as e:
                print(f"    Failed to navigate to {url}: {e}")
                errors.append(f"[{route}] Navigation Failed: {e}")
                
            page.close()
            
        browser.close()
        
    if errors or warnings:
        print('\n--- HEADLESS CONSOLE CHECK FAILED ---')
        if errors:
            print('\nErrors found:')
            for e in errors:
                print(f"  ❌ {e}")
        if warnings:
            print('\nWarnings found:')
            for w in warnings:
                print(f"  ⚠️ {w}")
        sys.exit(1)
        
    try:
        print('✅ Headless console check passed! No Vue warnings or errors detected.')
    except UnicodeEncodeError:
        print('OK! Headless console check passed! No Vue warnings or errors detected.')
    sys.exit(0)

if __name__ == "__main__":
    main()
