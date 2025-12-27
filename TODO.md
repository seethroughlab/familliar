[x] There should be many choices for the music visualizer. The music visualization system should have access to all song metadata (strings: artist, title, etc, lyrics, album art) and some of the music visualizations should use this data
[x] Why is there SpotifyFavoriteV2? What's with the v2? Is that a migration artifact? If so, let's optimize it. We're still in dev, so we shouldn'e be worrying about dataloss from migration.
[x] Please make a github actions CI service, and a release action, with badges in the README. And add detailed install instructions for OpenMediaVault installation and upgrades.
[x] Add instructions to README.md to get Anthropic key
[x] CI is still failing. The new run is at job-logs.txt
[x] What's left in familliar-dev-plan.md? I want to move towards doing a test install on my personal OpenMediaVault? I have auto-login setup with root@openmediavault (tailscale)
[x] The Context window never shows anything. 
[ ] The chat window should alert the user if there is no Anthropic API ket and OLLAMA isn't accessable -- just saying "Something went wrong" is bad UX.
[x] I get an error when I try to save anthopic API key: "Failed to save settings"
[x] Is there a way to tell if a scan is currently running in the UI? I'd like to be able to access fairly detailed info about the status of scans from the UI.
[x] Is the database wiped out every time the docker container is updated?
[x] Is 8000 the best choice of port for familliar? It seems like we should use ports that are less likely to be already used by other services. 
[x] Add a note to the "Auto-organization" settings for users who have more than one music application - they might not want to enable auto-organization if it's going to break other apps that have stored paths to audio files. Actually, while we're at it, if a database reecord becomes "orphaned" (file no longer where familliar thinks it is), we should have a search feature that tries to find it before elevating it to an error. Another app might have moved it. 
[ ] How does the ollama integration work? Does it have to run on the client side? It should run on the server side. 
[ ] DO we have a "favorites" flag for tracks, and play-count? These will be useful for smart playlists