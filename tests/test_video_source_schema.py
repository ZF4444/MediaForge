from app.services.ai_parameters.resolver import normalize_parameter_schema, parameter_schema_definitions


def test_video_aspect_definitions_offer_source_for_api_settings():
    field = next(field for field in parameter_schema_definitions()['video']['fields'] if field['id'] == 'videoAspect')
    assert 'source' in field['options']
    result = normalize_parameter_schema({'models': {'seedance': {'video': {'fields': [
        {'id': 'videoAspect', 'default': 'source', 'options': field['options']},
    ]}}}})
    assert result['models']['seedance']['video']['fields'][0]['default'] == 'source'
