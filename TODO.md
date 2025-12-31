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
[x] Are we done with _SYNOLOGY.md? If so, please delete it. 
[x] Update the README.md with all of the features of familliar. As well as the install instructions for OMV and Synology (assume that the repo is public)
[x] Why did you decide to make it a 0.2.0 instead of 0.1.1? In my mind, we're still doing hotfixes.
[x] Do an audit of what is stored in indexeddb and what is postgres (client vs server) and make sure it all makes sense considering the switch to profiles. 
[x] How does the ollama integration work? Does it have to run on the client side? It should run on the server side. 
[x] When syncing from Spotify, there should be an option to "favorite" matching tracks. But before we do that, how are we currently matching between Spotify and local tracks?
[x] The AI Assistant configuration is still visible in the Settings panel. It should be part of the admin interface.
[x] The admin interface should display the callback URL for Spotify (and anywhere else appropriate) so that the user knows what to put into https://developer.spotify.com/dashboard/
[x] The README should mention that is "somewhat" optimized for NAS usage (but phrased better than that), because I think it is... Do you see many people using this on a personal computer?
[x] PLAN: We should add a "New Releases" section to playlists. Let's think about how we can make that happen.
[x] Let's examine the UX around what appears in the LLM chat window if neither Anthropic nor Ollama are configured. Just saying "Something went wrong" is bad UX.
[x] Processing audio is stuck at "0 / 23,318 (0%)". This type of unexplained error with no error message seems to happen all of the time. Is this a fundamental error in the architicture? What can we do to globally prevent this type of problem?
[x] Please rename _RELEASE_CHECKLIST.md release-checklists/v0.1.1-checklist.md. This file should ONLY include tasks that MUST be done by a human. There are 3 types of tasks (1) fully automatic CI tests that can run on Github, (2) Automated tests that can be run and evaluated locally by Claude Code (3) Tests that require human execution and judgement. release-checklists/v0.1.1-checklist.md should reflect these categories and provide instructions on how to complete all of the tasks in the 3 categories. 
[x] Please move all of the "_*.md" files to a "plans" subdirectory. They are future plans for major features. 
[x] PLAN: I want to make a new plan file about the visualizer. I want it to be an API that anyone can contribute to. The API should provide all of the metadata, including ID3 tags, lyrics, album art, YouTube videos, BPM, key, and any other data that Familliar currently has about a particular song. The existing visualizers should be structured in such a way that they provide a model for future contributors. But (1) what does the API look like, and (2) how should people contribute?
[x] The Music Library path should be one of the settings in the admin interface. I'm debating whether we should remove the .env file altogether.
[x] Have you been making changes to the openmediavault install without making them locally?
[x] One time the Music Library path wasn't set properly, and thousands of tracks were deleted. This SHOULDN'T be able to happen. Let's think about how we can prevent this. Perhaps there should be a check before a scan that makes sure the music folder is available. And let's also think about asking the user for confirmation before deleting tracks from the database, and an opportunity to locate the files IF they can't automatically be found. I like the Adobe approach to missing assets - you can spcify a new folder to look in, or locate individual files. 
[x] Are Music Library Paths currently global or per-profile? If they are global, the interface for adding them should be in the admin settings.
[x] Before the restart, the alysis was stuck again - this time at 0.7%, and there are errors: 'active' is not among the defined enum values. Enum name: trackstatus. Possible values: ACTIVE, MISSING, PENDING_DEL..
[x] we add a way to remove API keys in the admin view  - currently you can only replace.
[ ] We need to clean up my openmediavault. There seem to be a few installs - at /root/familliar, at /opt/familliar, and then some other folders that were accidentally created because of some incorrect paths, like /Volumes/silo/music and /data/music.  Also, nothing on my openmediavault should reference "/Volumes/silo/music" (like /opt/familliar/docker/.env) -- that is ONLY relevant to my local Mac. Please check with me before deleting anything, but it seems we've made quite a mess of my openmediavault in this development effort.
[ ] It's been very painful debugging on openmediavault. Would it be easier to debug these last few issues building the docker container on my local Mac? Or is it better to work on the Linux machine (openmediavault)?
[ ] This is turning into a disaster. Things are breaking left and right and we seem to be getting further away from a release instead of closer. I don't know if we've just made some bad architectural decisions or tried to develop too many features at once. Please evaluate the current state of the codebase and give me an honest opinion on whether we'd be better off trying to fix what is broken or starting from scratch and learning from what we've done.
[ ] The settings view needs an overhaul -- we need to group like things together and explain what sections are. 
[ ] I had deleted my Anthropic key in the settings panel and the chat window didn't show an error. I thought we had added this.

## For future releases
[ ] Familliar should have a slightly witchy look inspired by the name. It should be subtle. Let's come up with a plan.
[ ] The Library view needs some work. You should be able to browse by artist/album/year/gener, but let's be smart about it and not just adopt an existing paradigm.
[ ] "Missing from Library" songs should also appear in playlists when relevant