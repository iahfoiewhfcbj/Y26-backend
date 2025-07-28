#!/bin/bash

echo "=== YUGAM FACILITIES PORTAL LOG MONITOR ==="
echo "Press Ctrl+C to stop monitoring"
echo ""

# Function to display logs in real-time
monitor_logs() {
    echo "Monitoring logs in real-time..."
    echo "----------------------------------------"
    
    # Monitor combined logs
    tail -f logs/combined.log | while read line; do
        # Parse JSON and format output
        timestamp=$(echo "$line" | jq -r '.timestamp // "N/A"' 2>/dev/null)
        level=$(echo "$line" | jq -r '.level // "N/A"' 2>/dev/null)
        message=$(echo "$line" | jq -r '.message // "N/A"' 2>/dev/null)
        userId=$(echo "$line" | jq -r '.userId // ""' 2>/dev/null)
        method=$(echo "$line" | jq -r '.method // ""' 2>/dev/null)
        url=$(echo "$line" | jq -r '.url // ""' 2>/dev/null)
        
        # Color coding based on log level
        case $level in
            "error")
                color="\033[31m" # Red
                ;;
            "warn")
                color="\033[33m" # Yellow
                ;;
            "info")
                color="\033[32m" # Green
                ;;
            "debug")
                color="\033[36m" # Cyan
                ;;
            *)
                color="\033[0m" # Default
                ;;
        esac
        
        # Format the output
        output="$timestamp [$level] $message"
        if [ ! -z "$userId" ]; then
            output="$output (User: $userId)"
        fi
        if [ ! -z "$method" ] && [ ! -z "$url" ]; then
            output="$output $method $url"
        fi
        
        echo -e "${color}${output}\033[0m"
    done
}

# Function to show log statistics
show_stats() {
    echo "=== LOG STATISTICS ==="
    echo "Total log entries: $(wc -l < logs/combined.log)"
    echo "Error entries: $(grep -c '"level":"error"' logs/combined.log)"
    echo "Info entries: $(grep -c '"level":"info"' logs/combined.log)"
    echo "Warn entries: $(grep -c '"level":"warn"' logs/combined.log)"
    echo ""
}

# Show initial statistics
show_stats

# Start monitoring
monitor_logs 