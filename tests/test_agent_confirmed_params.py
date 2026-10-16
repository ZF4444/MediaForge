from types import SimpleNamespace

from app.routers import canvas_agent
from app.services.canvas_agent.canvas_adapter import _canonical_node_data


def test_confirmed_workflow_parameters_reach_created_node(monkeypatch):
    schema = {'params_path': 'runSettings.rhParams', 'fields': [
        {'id': '6::ratio', 'type': 'dropdown', 'options': ['1:1', '4:3'], 'default': '1:1'},
        {'id': '7::strength', 'type': 'number', 'step': 0.1, 'default': 0.3},
    ]}
    monkeypatch.setattr(canvas_agent, 'capability_schema_resolver', lambda node: schema)
    node = SimpleNamespace(params={'6::ratio': '4:3'}, semantic_type='workflow_generation',
                           capability='runninghub.app.image', title='Workflow', connection_id='rh',
                           resource_id='app', model_id='')
    incoming = {'runSettings': {'rhParams': {'6::ratio': {'value': '4:3'}, '7::strength': {'value': 0.6},
                                            'unknown': {'value': 'drop'}}, 'engine': 'untrusted'}}
    params = canvas_agent._merge_confirmed_params(node, incoming)
    created = _canonical_node_data(node, 'smart-image', params)
    assert created['runSettings']['rhParams'] == {'6::ratio': {'value': '4:3'}, '7::strength': {'value': 0.6}}
    assert created['runSettings']['engine'] == 'runninghub'
