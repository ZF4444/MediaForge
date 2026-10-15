import asyncio
from unittest.mock import AsyncMock

import httpx
import pytest

from app.ai.adapters.video_protocol import video_output_urls
from app.services import video_download


def http_error(status):
    request = httpx.Request('GET', 'https://download.example/video')
    return httpx.HTTPStatusError('download failed', request=request, response=httpx.Response(status, request=request))


@pytest.fixture(autouse=True)
def no_retry_wait(monkeypatch):
    wait = AsyncMock()
    monkeypatch.setattr(video_download.asyncio, 'sleep', wait)
    return wait


def run(download, query, result=None, task_id='original-task'):
    return asyncio.run(video_download.download_generated_videos(
        result or {'videos': ['https://download.example/old']}, task_id=task_id,
        output_urls=video_output_urls, download=download, query_task=query,
    ))


def test_expired_link_is_replaced_by_original_task_query(no_retry_wait):
    refreshed = {'videos': ['https://download.example/fresh'], 'status': 'succeeded'}
    download = AsyncMock(side_effect=[http_error(404), '/api/files/video/content'])
    query = AsyncMock(return_value=refreshed)
    local, raw = run(download, query)
    assert local == ['/api/files/video/content']
    assert raw == refreshed
    assert [call.args[0] for call in download.await_args_list] == ['https://download.example/old', 'https://download.example/fresh']
    query.assert_awaited_once_with('original-task')
    no_retry_wait.assert_awaited_once_with(2)


@pytest.mark.parametrize('failure', [http_error(404), http_error(403), http_error(429), http_error(503), httpx.ConnectError('offline')])
def test_download_retry_is_bounded(failure, no_retry_wait):
    download = AsyncMock(side_effect=failure)
    query = AsyncMock(return_value={'videos': ['https://download.example/refreshed']})
    with pytest.raises(httpx.HTTPError):
        run(download, query)
    assert download.await_count == 3
    assert query.await_count == 2
    assert [call.args[0] for call in no_retry_wait.await_args_list] == [2, 4]


@pytest.mark.parametrize('failure', [http_error(400), RuntimeError('storage unavailable')])
def test_nontransient_and_storage_errors_are_not_retried(failure):
    download = AsyncMock(side_effect=failure)
    query = AsyncMock()
    with pytest.raises(type(failure)):
        run(download, query)
    assert download.await_count == 1
    query.assert_not_called()


def test_successful_outputs_are_not_downloaded_again():
    download = AsyncMock(side_effect=['/api/files/first/content', http_error(404), '/api/files/second/content'])
    query = AsyncMock(return_value={'videos': ['https://download.example/new1', 'https://download.example/new2']})
    local, _ = run(download, query, result={'videos': ['https://download.example/old1', 'https://download.example/old2']})
    assert local == ['/api/files/first/content', '/api/files/second/content']
    assert [call.args[0] for call in download.await_args_list] == ['https://download.example/old1', 'https://download.example/old2', 'https://download.example/new2']


@pytest.mark.parametrize('query_result', [httpx.ConnectError('query offline'), ValueError('invalid JSON'), {'status': 'running'}, {'videos': ['https://example/a', 'https://example/b']}])
def test_unavailable_refresh_falls_back_to_existing_link(query_result):
    download = AsyncMock(side_effect=[http_error(404), '/api/files/video/content'])
    query = AsyncMock(side_effect=query_result) if isinstance(query_result, Exception) else AsyncMock(return_value=query_result)
    local, _ = run(download, query)
    assert local == ['/api/files/video/content']
    assert [call.args[0] for call in download.await_args_list] == ['https://download.example/old'] * 2


def test_missing_task_id_retries_download_without_query():
    download = AsyncMock(side_effect=[httpx.ReadTimeout('timeout'), '/api/files/video/content'])
    query = AsyncMock()
    assert run(download, query, task_id=None)[0] == ['/api/files/video/content']
    query.assert_not_called()


def test_success_needs_no_query_or_delay(no_retry_wait):
    download = AsyncMock(return_value='/api/files/video/content')
    query = AsyncMock()
    assert run(download, query)[0] == ['/api/files/video/content']
    query.assert_not_called()
    no_retry_wait.assert_not_called()
