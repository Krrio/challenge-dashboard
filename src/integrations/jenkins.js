// STAGE import pipeline. The Jenkins job re-imports one UTC month of challenges from the
// spreadsheet, so a deployment writes the spreadsheet first and then runs one build per affected
// month with exactly these parameters. Credentials and the job URL stay on the server.
export const IMPORTER_TYPE = "challenge";

export function importParameters(spreadsheetId, month) {
  const [year, monthNumber] = month.split("-");
  return { SPREADSHEET_ID: spreadsheetId, UTC_YEAR: year, UTC_MONTH: monthNumber, IMPORTER_TYPE };
}

// Local stand-in for the Jenkins job. `runBuild` simulates the build and rejects to fail it; a real
// adapter would call buildWithParameters, wait for the queue item and poll the build result.
export class MockJenkins {
  #runBuild;
  #nextNumber;

  constructor({ runBuild, nextNumber = 1 }) {
    this.#runBuild = runBuild;
    this.#nextNumber = nextNumber;
  }

  async runImport(parameters, plan) {
    const build = { number: this.#nextNumber++, parameters: { ...parameters }, startedAt: new Date().toISOString() };
    try {
      await this.#runBuild(structuredClone(plan), { ...parameters });
      return { ...build, status: "SUCCESS", finishedAt: new Date().toISOString() };
    } catch (error) {
      return { ...build, status: "FAILURE", finishedAt: new Date().toISOString(), log: error.message };
    }
  }
}
