import pathlib
p = pathlib.Path('C:/Users/moses.massaquoi/Documents/Project-Z/frontend/src/pages/LeaveManagement.tsx')
content = open(p, 'r', encoding='utf-8').read()
print(f'Current file has {len(content)} chars, {content.count(chr(10))+1} lines')
print(f'Last 50 chars: {repr(content[-50:])}')
