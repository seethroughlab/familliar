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
[x] when I do a hard refresh, the conversation history reappears, but the context window is now blank
[x] Now, when I click "Connect Spotify", it just takes me to the library view
[x] When I sync spotify, I get 0 Total Favorites 0 Matched 0 Unmatched 0% Match Rate, which I know is incorrect.
[x] When the LLM makes a playlist, it should be saved as a playlist, with an appropriate name. It should be somehow distinguished from a manually-created playlist. 
[x] for a better UX (especially with large libraries), we should move the spotify sync task to Celery with progress reporting. It should:
  - Show real-time progress ("Fetching tracks... 500/1700")
  - Not block API restarts
  - Allow you to navigate away without interrupting
[x] please read job-logs-*.txt and fix the CI issue
[x] PLAN: We need to re-think the context view. It's not doing what I thought it was going to do. Currently, it seems to just keep a history of all of the searches that the LLM does. It should be more like the CURRENT list of songs that the LLM has returned, as well as recommendations of albums to buy based on Spotify missing tracks. I'd also like to add recommendaayions of NEW albums to add to the library. The idea here is that users will want a "discovery" mechanism similar to what Spotify provides. Where can we get these recommendations? Let's make a full plan for the context view redesign. Please ask any clarifying questions you need to.
[ ] Do we have a "favorites" flag for tracks, and play-count? These will be useful for smart playlists
[ ] How does the ollama integration work? Does it have to run on the client side? It should run on the server side. 
[ ] Can you explain how the LLM currently chooses tracks to play? It seems to be almost completely genre-based. I was hoping it would use much more information to make a track selection. It seems to tend to just pick tracks from one album. It should try to avoid picking tracks from only one album/artist.