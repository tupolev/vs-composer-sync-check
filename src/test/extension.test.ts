import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
	test('configuration exposes composer path settings', () => {
		const config = vscode.workspace.getConfiguration('composerSyncCheck');
		assert.strictEqual(config.get<string>('composerJsonPath', ''), 'composer.json');
		assert.strictEqual(config.get<string>('composerLockPath', ''), 'composer.lock');
	});
});
