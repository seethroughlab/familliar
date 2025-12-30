[x] There should be many choices for the music visualizer. The music visualization system should have access to all song metadata (strings: artist, title, etc, lyrics, album art) and some of the music visualizations should use this data
[x] Why is there SpotifyFavoriteV2? What's with the v2? Is that a migration artifact? If so, let's optimize it. We're still in dev, so we shouldn'e be worrying about dataloss from migration.
[x] Please make a github actions CI service, and a release action, with badges in the README. And add detailed install instructions for OpenMediaVault installation and upgrades.
[x] Add instructions to README.md to get Anthropic key
[x] CI is still failing. The new run is at job-logs.txt
[x] What's left in familliar-dev-plan.md? I want to move towards doing a test install on my personal OpenMediaVault? I have auto-login setup with root@openmediavault (tailscale)
[x] The Context window never shows anything. 
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
[x] Can you explain how the LLM currently chooses tracks to play? It seems to be almost completely genre-based. I was hoping it would use much more information to make a track selection. It seems to tend to just pick tracks from one album. It should try to avoid picking tracks from only one album/artist.
[x] Do we have a "favorites" flag for tracks, and play-count? These will be useful for smart playlists
[x] I'm worried that these worker processes seem so delicate and keep failing silently. It takes you a while each time to find the errors. Is there anything we should do to make them more resilient and have better error reporting? The user shouldn't be prompted to "Ensure Celery workers are running to process the queue." -- the user doesn't know what a Celery worker is. 
[x] When I clikc "Full Scan", the button currently spins for about 3 seconds and then stops. Is that expected? there is no progress indicator.
[x] System Status "Some services need attention" and "Some features may be limited." are ambiguous and don't give the user any indication of whether they need to do anything, or why. 
[x] Profile chooser is not visible.
[x] How do you cache (download locally for offline listening) a playlist? I don't see the option anywhere in the existing playlists.
[x] The LLM should come up with better titles for playlists. 
[x] Why does "Analysis Progress" have such a prominent position in the overall system status, design-wise? Isn't it kind of part of a library scan? Shouldn't it be shown there? The System Status view is still a bit confusing. 
[x] Is analysis status included in the scan progress? 
[x] Do scans currently happen automatically at all? 
[x] We need the ability to rename profiles and choose a profile image (with auto-cropping/resize)
[x] The play button doesn't update when the LLM starts to play a playlist. 
[x] Why does System Status say "Background Processing: 1 process(es) running 1 process(es) active" even though both a library scan AND audio analysis are running? This is confusing for the user. 
[x] The visualizer should be available to fill the Library/Playlists/Settings view at any time, with the option to go fullscreen.
[x] please read job-logs-*.txt and fix the CI issues.
[x] What would it take to get this to run on Synology NAS servers in addition to openmediavault? I think openmediavault is too niche and we need to support other platforms in order to make familliar more useful.
[x] When I enter my Anthropic API key and press Save, it hangs on "Saving..."
[x] Library Status 'ScanProgressReporter' object has no attribute 'progress'
[x] When I enter my Anthropic key and click Save, it says "Failed to save settings"
[x] Please make a CHANGELOG with the changes in all of the tagged releases.
[x] It says "No tracks found" even though I've done a scan
[x] The filename "familliar-dev-plan.md" isn't really accurate anymore. Please separate it into as many plan files (start with "_", like "_SYNOLOGY.md) as appropriate, that contain detailed steps to complete the plan. Then delete familliar-dev-plan.md
[x] When I enter my Spotify id and secret, it says that it was successfully saved, but it doesn't update to the "Connect to Spotify.." button - it stays on the client ID and client secret form.
[ ] The chat window should alert the user if there is no Anthropic API ket and OLLAMA isn't accessable -- just saying "Something went wrong" is bad UX.
[ ] How does the ollama integration work? Does it have to run on the client side? It should run on the server side. 
[ ] "Missing from Library" songs should also appear in AI-generated playlists when relevant
[ ] Do an audit of what is stored in indexeddb and what is postgres (client vs server) and make sure it all makes sense considering the switch to profiles. 
[ ] Are we done with _SYNOLOGY.md?
[ ] Update the README.md with all of the features of familliar. As well as the install instructions for OMV and Synology (assume that the repo is public)