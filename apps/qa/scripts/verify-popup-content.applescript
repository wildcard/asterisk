#!/usr/bin/osascript

-- Verify Extension Popup Content
-- Uses macOS Accessibility APIs to read and verify popup elements

on run
    tell application "System Events"
        tell process "Google Chrome"
            -- Get the frontmost window (should be the popup)
            set frontWindow to front window

            -- Try to get UI elements
            try
                set allElements to every UI element of frontWindow

                log "Found " & (count of allElements) & " UI elements"

                -- Look for specific text elements
                set foundElements to {}

                repeat with elem in allElements
                    try
                        set elemValue to value of elem
                        set elemRole to role of elem
                        set elemDesc to description of elem

                        -- Check if this is a text element
                        if elemRole is "AXStaticText" or elemRole is "AXButton" then
                            set end of foundElements to {|value|:elemValue, |role|:elemRole, |description|:elemDesc}
                        end if
                    end try
                end repeat

                -- Check for expected content
                set popupValid to false
                set hasFormDetected to false
                set hasFillButton to false

                repeat with elem in foundElements
                    set elemValue to |value| of elem

                    if elemValue contains "Asterisk" then
                        set popupValid to true
                    end if

                    if elemValue contains "Form Detected" then
                        set hasFormDetected to true
                    end if

                    if elemValue contains "Fill" then
                        set hasFillButton to true
                    end if
                end repeat

                -- Return results as JSON-like string
                set result to "{"
                set result to result & "\"popupValid\": " & popupValid & ", "
                set result to result & "\"hasFormDetected\": " & hasFormDetected & ", "
                set result to result & "\"hasFillButton\": " & hasFillButton & ", "
                set result to result & "\"elementCount\": " & (count of foundElements)
                set result to result & "}"

                return result

            on error errMsg
                return "{\"error\": \"" & errMsg & "\"}"
            end try
        end tell
    end tell
end run
