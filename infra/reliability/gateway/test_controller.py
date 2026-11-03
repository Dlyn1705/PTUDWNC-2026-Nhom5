import unittest
from unittest.mock import patch
import controller


class GatewayResolutionTests(unittest.TestCase):
    def test_host_gateway_alias_is_resolved_for_admitted_traffic(self):
        with patch.object(controller, 'UPSTREAM', 'host.docker.internal:5010'), patch.object(controller, 'FRONTEND', 'host.docker.internal:5011'), patch.object(controller.socket, 'gethostbyname', return_value='172.17.0.1'):
            config = controller.config(True)
        self.assertIn('set $api_endpoint "172.17.0.1:5010";', config)
        self.assertIn('set $frontend_endpoint "172.17.0.1:5011";', config)
        self.assertNotIn('host.docker.internal', config)
        self.assertIn('proxy_pass http://$api_endpoint;', config)

    def test_container_service_names_keep_runtime_dns(self):
        with patch.object(controller, 'UPSTREAM', 'api:8080'), patch.object(controller, 'FRONTEND', 'frontend:3000'), patch.object(controller.socket, 'gethostbyname') as resolve:
            config = controller.config(False)
        resolve.assert_not_called()
        self.assertIn('set $api_endpoint "api:8080";', config)
        self.assertIn('set $frontend_endpoint "frontend:3000";', config)
        self.assertIn('return 503;', config)
        self.assertIn('resolver 127.0.0.11 ipv6=off valid=10s;', config)


if __name__ == '__main__':
    unittest.main()
