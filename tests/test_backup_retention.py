"""A successful backup must remain available for restoration."""
import sys

import pytest

from scripts import backup_services


@pytest.mark.parametrize('retention', ['0', '14'])
def test_backup_keeps_new_snapshot(tmp_path, monkeypatch, retention):
    monkeypatch.setenv('DATABASE_URL', 'postgresql://localhost/test')
    monkeypatch.setattr(sys, 'argv', [
        'backup_services.py', '--only', 'postgres', '--output-dir', str(tmp_path),
        '--retention-days', retention,
    ])
    monkeypatch.setattr(backup_services, 'command_exists', lambda name: None)

    def dump(args):
        from pathlib import Path
        Path(args[-1]).write_bytes(b'restorable database backup')

    monkeypatch.setattr(backup_services, 'run_command', dump)
    assert backup_services.main() == 0
    snapshots = list(tmp_path.glob('20*'))
    assert len(snapshots) == 1
    assert (snapshots[0] / 'postgres.dump').read_bytes() == b'restorable database backup'
    assert (snapshots[0] / 'SHA256SUMS').is_file()
