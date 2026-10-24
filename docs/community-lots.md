# Friends and empty lots

Select an empty lot and choose **Continue with GitHub to submit this lot**. GitHub signs you in, or uses your existing GitHub session, and opens the city's project form. Your public GitHub account identifies the submission. There is no separate Mycity password or simulated in-world account.

Enter a project title, its deployed HTTPS address, and a short description. The selected slot and neighborhood are prefilled. Submitting creates a public request, rather than immediately reserving or publishing the lot. Existing published lots remain in place until the city owner approves a new request.

The source app keeps its original hosting. A published community lot opens its project in a new tab. The submission pipeline imports text and links; it does not download, run, or publish submitted source code.

## City owner: publish a request

1. Check that the requested slot is still empty and the linked project is the intended destination.
2. Apply the repository label **`city:approved`** to that issue using the `nothatcher-creator` account.
3. The **Publish an approved community lot** workflow validates the approval event snapshot, updates the catalog and shared activity journal, runs tests and the production build, and commits the approved metadata.
4. The workflow explicitly starts **Deploy Nothatcher District**. Commits made with GitHub's workflow token do not automatically trigger another push workflow.

The form uses `city:submission`; both labels must exist in the repository. A different account applying the approval label does not publish a lot. Editing an approved issue does not silently update the project. Publishing the same issue again leaves the catalog and journal unchanged, preserving the reviewed version. It still starts the Pages deployment, so retrying can recover a failed deployment after a successful metadata commit.

If another request already filled the slot, validation stops the workflow. If a competing repository push arrives during publication, the push fails without overwriting the newer branch. Check the slot, then remove and reapply `city:approved` to retry an unpublished request. GitHub allows only one pending run per concurrency group; if several requests are approved together, check each workflow and retry a canceled pending run.

## Shared journal and privacy

Published contributions are recorded in `public/city-activity.json`, including the project's title, slot, approval timestamp, public GitHub username, and source issue link. This is a shared publication history, not a count of live players or a recording of everyone's movements. Browser-local visits can appear separately in the world's local activity panel.

Titles are limited to 80 characters and descriptions to 500. Destinations must be HTTPS URLs without embedded credentials, on public domain names; local/network IP addresses and `.local` hosts are rejected. Submitted content is treated as data and must be displayed with text-safe DOM methods.
