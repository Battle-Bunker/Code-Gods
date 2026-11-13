SCREEN-ONLY BROWSER HARNESS (you see the app only through this; do not read the app's source or call its APIs)
W=<WALK>
Start (once; pick a free port P, e.g. 4701..4799, and your own OUT dir; NAME = your user, e.g. alice):
  nohup node $W/server.js --port P --user NAME --viewport 1440x900 --dir OUT > OUT.log 2>&1 &
  (phone: --viewport 390x844). Wait until OUT.log says "ready" (~5-10 s). You are then signed in on the home page.
  The server exits by itself after 40 minutes, or on quit.
Commands: node $W/cli.js P <command>
  look                  screenshot OUT/NNN.png + text of what is visible in the viewport now
  click N               click element number N from the LAST output (numbers change with every output!)
  clickxy X Y           click at viewport pixel X,Y (CSS pixels = PNG pixels)
  type N text...        click element N, then type the text at the cursor (keeps existing content)
  fill N text...        replace the content of input/textarea/editor N; for a [select], text = the option label
  fill N --file PATH    same, text taken from a file (use this for multi-line code); type also takes --file
  key Enter|Escape|Tab|ArrowDown|Control+A|...   press a key in the focused element
  scroll up|down [px]   mouse-wheel at the viewport centre;  scrollat X Y DY  wheel at X,Y (DY<0 = up)
  wait SECONDS          (max 30) then look;   back   browser back (or closes an extra tab)
  friends CODE [names]  helper, NOT part of your screen: other test users (default bob carol) join room CODE
  quit
Every command except friends/quit prints, after acting (~0.6 s settle), the same as look:
  shot: path of the PNG | clock: seconds since sign-in finished (your stopwatch) | url, title, page-scroll now/max
  then the visible text top-to-bottom. "[3 button] Label" = clickable element 3; inputs show placeholder/value;
  attrs like disabled/checked/focused/expanded; "#" = heading; "   |   " separates things side by side on one row
  (columns are interleaved row by row); "{canvas|img|svg ... Read the PNG}" = a graphic the text cannot show.
When the text is unclear (layout, colours, icons, boards, charts), Read the PNG: it is exactly what a user sees.
An ERROR line means the command did nothing; run look and retry with fresh numbers.
