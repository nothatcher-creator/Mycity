# Friends and empty lots

Choose **Add to city** at the top of the world. Paste a live HTTPS project link and check the suggested name and neighborhood. Choose one of six downloaded buildings and preview it in 3D. The city selects an empty lot automatically; **Choose a specific lot** lets you pick another. You can also select an empty lot on the map and choose **Add a project here**. Unfinished drafts stay on this device; **Start fresh** clears the draft.

Add an optional short description, then choose **Continue with GitHub**. A fully filled request opens on GitHub. GitHub signs you in, or uses your existing session; press **Submit new issue** there to finish. Your public GitHub account identifies the submission. There is no separate Mycity password or simulated in-world account. A prepared or submitted request does not reserve or publish a lot; existing published lots stay in place until the city owner approves a request. The form checks for links already published in the city.

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

The optional **Lot style** section accepts only `studio`, `arcade`, `gallery`, `workshop`, `tower`, and `garden`, which select reviewed local CC0 models. Older requests without this field remain valid. No submitted model URL or script is loaded. See [asset sources and licenses](city-assets.md).
