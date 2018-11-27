"use strict";
const express = require("express");
const bodyParser = require("body-parser");
const Logger = require("../utils/Logger");
const InjectionExtractor = require("../injection/InjectionExtractor");
const router = express.Router();
const urlencodedParser = bodyParser.urlencoded({
    extended: true,
});
function getPushedBranches(req) {
    const pushedBranches = [];
    // find which branch is pushed
    // Add it in pushedBranches
    let isGithub = req.header('X-GitHub-Event') === 'push';
    let isBitbucket = req.header('X-Event-Key') === 'repo:push' &&
        req.header('X-Request-UUID') &&
        req.header('X-Hook-UUID');
    let isGitlab = req.header('X-Gitlab-Event') === 'Push Hook';
    if (isGithub) {
        let refPayloadByFormEncoded = req.body.payload;
        let bodyJson = req.body;
        if (refPayloadByFormEncoded) {
            bodyJson = JSON.parse(refPayloadByFormEncoded);
        }
        let ref = bodyJson.ref; // "refs/heads/somebranch"
        pushedBranches.push(ref.substring(11, ref.length));
    }
    else if (isBitbucket) {
        for (let i = 0; i < req.body.push.changes.length; i++) {
            pushedBranches.push(req.body.push.changes[i].new.name);
        }
    }
    else if (isGitlab) {
        let ref = req.body.ref; // "refs/heads/somebranch"
        pushedBranches.push(ref.substring(11, ref.length));
    }
    return pushedBranches;
}
router.post('/triggerbuild', urlencodedParser, function (req, res, next) {
    // From this point on, we don't want to error out. Just do the build process in the background
    res.sendStatus(200);
    Promise.resolve()
        .then(function () {
        const extracted = InjectionExtractor.extractAppAndUserForWebhook(res);
        let serviceManager = extracted.user.serviceManager;
        let namespace = extracted.user.namespace;
        let appName = extracted.appName;
        let app = extracted.app;
        if (!app || !serviceManager || !namespace || !appName) {
            throw new Error('Something went wrong during trigger build. Cannot extract app information from the payload.');
        }
        const repoInfo = app.appPushWebhook.repoInfo;
        // if we didn't detect branches, the POST might have come from another source that we don't
        // explicitly support. Therefore, we just let it go through and triggers a build regardless.
        const pushedBranches = getPushedBranches(req);
        if (pushedBranches.length > 0) {
            let branchIsTracked = false;
            for (let i = 0; i < pushedBranches.length; i++) {
                if (pushedBranches[i] === repoInfo.branch) {
                    branchIsTracked = true;
                    break;
                }
            }
            // POST call was triggered due to another branch being pushed. We don't need to trigger the build.
            if (!branchIsTracked) {
                return;
            }
        }
        return serviceManager
            .createImage(appName, {
            repoInfo: repoInfo,
        }, '')
            .then(function (version) {
            return serviceManager.ensureServiceInitedAndUpdated(appName, version);
        });
    })
        .catch(function (error) {
        Logger.e(error);
    });
});
module.exports = router;
//# sourceMappingURL=WebhooksRouter.js.map