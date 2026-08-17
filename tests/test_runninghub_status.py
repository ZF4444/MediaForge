from main import runninghub_normalized_status


def test_runninghub_outputs_task_running_code_stays_pending():
    assert runninghub_normalized_status({"code": 804, "msg": "APIKEY_TASK_IS_RUNNING"}, 804, []) == "RUNNING"


def test_runninghub_outputs_unknown_error_still_fails():
    assert runninghub_normalized_status({"code": 500, "msg": "failed"}, 500, []) == "FAILED"
