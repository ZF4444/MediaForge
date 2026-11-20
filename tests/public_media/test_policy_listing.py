def seed(writer):
    # global row exists and is enabled; add 5 task rows (one disabled) and 4 file rows (all disabled)
    for index in range(5):
        writer.set_policy("task", f"task-{index:02d}", index != 2)
    for index in range(4):
        writer.set_policy("file", f"file-{index:02d}", False)
    writer.set_policy("task", "odd_%name\\x", False)


def keys(page):
    return [(row["scope"], row["key"]) for row in page["items"]]


def test_list_policies_pages_in_stable_order_and_reports_total(real):
    writer = real["writer"]
    seed(writer)
    first = writer.list_policies(0, 4)
    assert first["total"] == 11 and first["offset"] == 0 and first["limit"] == 4
    everything = [k for page in (0, 4, 8) for k in keys(writer.list_policies(page, 4))]
    assert everything == [(row["scope"], row["key"]) for row in writer.policies()]
    assert len(set(everything)) == 11
    assert writer.list_policies(100, 4)["items"] == []
    assert writer.list_policies(100, 4)["total"] == 11


def test_list_policies_filters_by_scope_enabled_and_keyword(real):
    writer = real["writer"]
    seed(writer)
    assert {s for s, _ in keys(writer.list_policies(0, 50, scope="file"))} == {"file"}
    assert writer.list_policies(0, 50, scope="file")["total"] == 4
    assert writer.list_policies(0, 50, scope="global")["total"] == 1
    disabled = writer.list_policies(0, 50, enabled=False)
    assert disabled["total"] == 6 and all(not row["enabled"] for row in disabled["items"])
    assert writer.list_policies(0, 50, enabled=True)["total"] == 5
    both = writer.list_policies(0, 50, scope="task", enabled=False)
    assert sorted(k for _, k in keys(both)) == ["odd_%name\\x", "task-02"]
    assert keys(writer.list_policies(0, 50, keyword="TASK-03")) == [("task", "task-03")]
    assert writer.list_policies(0, 50, scope="task", keyword="file-")["total"] == 0


def test_list_policies_treats_keyword_wildcards_literally(real):
    writer = real["writer"]
    seed(writer)
    assert keys(writer.list_policies(0, 50, keyword="%")) == [("task", "odd_%name\\x")]
    assert keys(writer.list_policies(0, 50, keyword="_%n")) == [("task", "odd_%name\\x")]
    assert keys(writer.list_policies(0, 50, keyword="\\")) == [("task", "odd_%name\\x")]
    assert writer.list_policies(0, 50, keyword="task_0")["total"] == 0
    assert writer.list_policies(0, 50, keyword="'; DROP TABLE media.media_policy_state;--")["total"] == 0
    # The injection attempt above must not have touched the table.
    assert writer.list_policies(0, 1)["total"] == 11
