const { expect } = require('chai');
const { interactive, ifInteractive } = require('../../utils/interactive.js');
// const { output } = require('codeceptjs');

const I = actor();
I.cache = {};

Feature('Workspace page');

Scenario('Unauthenticated user is redirected to Login page @manual', ifInteractive(
  async () => {
    const result = interactive(`
              1. Navigate to workspace page like https://qa-heal.planx-pla.net/workspace without logging into the application.
              2. User is redirected to the login page
          `);
    expect(result.didPass, result.details).to.be.true;
  },
));

Scenario('Connect to external data resources @manual', ifInteractive(
  async () => {
    const result = interactive(`
              1. Select data resource other than HEAL in discoery page - https://qa-heal.planx-pla.net/discovery - without connecting to it
              2. Select a study and click "Open in Workspace"
              3. User is directed to connect to the data resource in Profile page
          `);
    expect(result.didPass, result.details).to.be.true;
  },
));

Scenario('Connect to external data resources @manual', ifInteractive(
  async () => {
    const result = interactive(`
              1. Select data resource other than HEAL in discovery page - https://qa-heal.planx-pla.net/discovery - without connecting to it
              2. Select a study and click "Open in Workspace" button
              3. User is directed to connect to the data resource in Profile page
          `);
    expect(result.didPass, result.details).to.be.true;
  },
));

Scenario('Gen3 SDK integration @manual', ifInteractive(
  async () => {
    const result = interactive(`
        1. Select a study in the discovery page with data available - https://qa-heal.planx-pla.net/discovery
        2. Click "Open in Workspace" button
        3. Select a notebook on the Workspace page
        4. User can see placeholder files in "data" folder once the workspace starts
        5. Copy the command "gen3 pull_object..." from a placeholder file
        6. Paste the command in a new terminal window and run it
        7. The file is available to be used in the Jupyter notebook
    `);
    expect(result.didPass, result.details).to.be.true;
  },
));

Scenario('Launch a workspace @wip', async ({ home, workspace, users }) => {
  // Login
  home.do.goToHomepage();
  await home.complete.login(users.indexingAcct);
  // Launch workspace
  workspace.do.goToPage();
  workspace.do.launchWorkspace('(Generic, Limited Gen3-licensed) Stata Notebook');
  I.waitForElement(workspace.props.iframeWorkspace);
  I.saveScreenshot('workspace.png');
});
