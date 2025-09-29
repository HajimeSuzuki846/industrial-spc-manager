import { Factory } from '../types';

export const mockFactories: Factory[] = [
  {
    id: 'factory1',
    name: 'Manufacturing Plant A',
    lines: [
      {
        id: 'line1',
        name: 'Production Line 1',
        factoryId: 'factory1',
        assets: [
          {
            id: 'asset1',
            name: 'Temperature Sensor 001',
            type: 'sensor',
            lineId: 'line1',
            status: 'online',
            dataSourceType: 'mqtt',
            mqttTopic: 'factory1/line1/temperature',
            alertRules: [
              {
                id: 'rule1',
                name: 'High Temperature Alert',
                assetId: 'asset1',
                isActive: true,
                conditions: [
                  {
                    id: 'condition1',
                    type: 'simple',
                    parameter: 'temperature',
                    operator: '>',
                    value: 100
                  }
                ],
                actions: [
                  {
                    id: 'action1',
                    type: 'mqtt',
                    config: {
                      topic: 'alerts/temperature',
                      message: 'High temperature alert triggered!'
                    }
                  }
                ]
              }
            ]
          },
          {
            id: 'asset2',
            name: 'Pressure Monitor 001',
            type: 'sensor',
            lineId: 'line1',
            status: 'warning',
            dataSourceType: 'mqtt',
            mqttTopic: 'factory1/line1/pressure',
            alertRules: [
              {
                id: 'rule2',
                name: 'High Pressure Alert',
                assetId: 'asset2',
                isActive: true,
                conditions: [
                  {
                    id: 'condition2',
                    type: 'simple',
                    parameter: 'pressure',
                    operator: '>',
                    value: 50
                  }
                ],
                actions: [
                  {
                    id: 'action2',
                    type: 'mqtt',
                    config: {
                      topic: 'alerts/pressure',
                      message: 'High pressure alert triggered!'
                    }
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        id: 'line2',
        name: 'Production Line 2',
        factoryId: 'factory1',
        assets: [
          {
            id: 'asset3',
            name: 'Vibration Monitor 001',
            type: 'sensor',
            lineId: 'line2',
            status: 'online',
            dataSourceType: 'mqtt',
            mqttTopic: 'factory1/line2/vibration',
            alertRules: [
              {
                id: 'rule3',
                name: 'High Vibration Alert',
                assetId: 'asset3',
                isActive: true,
                conditions: [
                  {
                    id: 'condition3',
                    type: 'simple',
                    parameter: 'vibration',
                    operator: '>',
                    value: 10
                  }
                ],
                actions: [
                  {
                    id: 'action3',
                    type: 'mqtt',
                    config: {
                      topic: 'alerts/vibration',
                      message: 'High vibration alert triggered!'
                    }
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'factory2',
    name: 'Manufacturing Plant B',
    lines: [
      {
        id: 'line3',
        name: 'Assembly Line A',
        factoryId: 'factory2',
        assets: [
          {
            id: 'asset4',
            name: 'Motor Controller 001',
            type: 'controller',
            lineId: 'line3',
            status: 'offline',
            dataSourceType: 'mqtt',
            mqttTopic: 'factory2/line3/motor',
            alertRules: []
          }
        ]
      }
    ]
  }
];