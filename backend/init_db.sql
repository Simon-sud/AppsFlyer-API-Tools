-- MySQL dump 10.13  Distrib 9.3.0, for macos15.2 (arm64)
--
-- Host: localhost    Database: appsflyer_rawdata
-- ------------------------------------------------------
-- Server version	9.3.0

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

SET FOREIGN_KEY_CHECKS = 0;

--
-- Table structure for table `account_configs`
--

DROP TABLE IF EXISTS `account_configs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `account_configs` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `account_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `account_type` enum('PID','PRT') COLLATE utf8mb4_unicode_ci NOT NULL,
  `api_token` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_default` tinyint(1) DEFAULT '0',
  `user_ids` json DEFAULT NULL COMMENT '关联的用户ID数组，NULL表示所有用户可见',
  `validate` text DEFAULT NULL COMMENT '账户有效性验证结果(JSON字符串)',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_account_type` (`account_type`),
  INDEX `idx_account_name` (`account_name`),
  INDEX `idx_created_at` (`created_at`),
  INDEX `idx_user_ids` ((CAST(user_ids AS CHAR(100))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `account_configs`
--

LOCK TABLES `account_configs` WRITE;
/*!40000 ALTER TABLE `account_configs` DISABLE KEYS */;
INSERT INTO `account_configs` VALUES 
('1', 'adgeniuszii_int', 'PID', 'eyJhbGciOiJBMjU2S1ciLCJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIiwidHlwIjoiSldUIiwiemlwIjoiREVGIn0.Nwbh5AbPIQgezNhs0EMJj6ZEsWiFu8Jsw4aTAvVIVb9swZXPZU46sg.UFntfXeuAHRuAGTi.5UAmV9mYxCsSUgwl0E6FpRVA7f8gxBqWCPI4_dGTUUFEMxVcyTlYCkJzBXU1w7UCmNWHwEJ6Ft2BOTnzeZDyZ2Mc4MfcBEKflpPII3xee5n7ndzUqd4K8CLTZRnaunGYSjQYc2RqOk-Iz_xes_6E0bHh9WfWHPfhYclGWaJoVKNIBtzU-T8jLQ715ReQbHT8yXZV0tBe1R1BeIdvFOSdEgaLs5eeNnbyb6ch4LblKhXpUwegqdFBR0ZVPS98FdnJEjUi6e0ZXMX3V8JJhh5pn2VYH_k4ayUhveqey5KmmXuKyM_2scV41Ha4cErWgAG-9gqA7Q0d2B_t45sYwyzhq78XqMs.CYAm5u3F5LNEaAbV4PKgHg', 1, '["e26325bc-3727-11f0-8fd9-ca45fa178246", "e26349fc-3727-11f0-8fd9-ca45fa178246", "e2635050-3727-11f0-8fd9-ca45fa178246", "e2635258-3727-11f0-8fd9-ca45fa178246", "e2636658-3727-11f0-8fd9-ca45fa178246", "e263684c-3727-11f0-8fd9-ca45fa178246", "e263684e-3727-11f0-8fd9-ca45fa178246"]', NULL, NOW(), NOW()),
('2', 'quirkytice2_int', 'PID', 'eyJhbGciOiJBMjU2S1ciLCJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIiwidHlwIjoiSldUIiwiemlwIjoiREVGIn0.Y6ZJDpSvjiYH6RRa2TLgXQtDfjRpPPEeWZ_gRMu-s_8cGwtAasZR6g.b7jRUIImdqOvJayj.Mt6F0SQv5Z4PzRoA_2PAzdLeUN2Y6_hZQkaRgWXZFNqrNCteldaEv3ujU4q0ioXl0PlZVSih26kbyrrA-LQtqtlwxxmMoTuAOAFfBfOzoIRb1rdMrTYIaQXNMslXVos7jJsBxXJvgvP7p6FxshynpEuwzgnCgYdfqJC3an-Pev2YNNqcCyilu4NbJJaT5YglKmgwJPD06yF8bYiGhEV_wCF-A1oALWDhzCwahpnJziR5R85UVygEZDKfwHWNPWY7ARajDa_YQYsABOBoJRzYfLQgyYjG6wH9j7Nv-csxYxu0ifO_xbAahHfNAj7Qn4AFKr4_U5NQ7Y9Bi7d93fiooncAbw.tJi4IYYi3sIUQgA_gJkz9g', 1, '["e26325bc-3727-11f0-8fd9-ca45fa178246", "e26349fc-3727-11f0-8fd9-ca45fa178246", "e2635050-3727-11f0-8fd9-ca45fa178246", "e2635258-3727-11f0-8fd9-ca45fa178246", "e2636658-3727-11f0-8fd9-ca45fa178246", "e263684c-3727-11f0-8fd9-ca45fa178246", "e263684e-3727-11f0-8fd9-ca45fa178246"]', NULL, NOW(), NOW()),
('3', 'trendimpado_int', 'PID', 'eyJhbGciOiJBMjU2S1ciLCJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIiwidHlwIjoiSldUIiwiemlwIjoiREVGIn0.UFZJil9QjqeUijcQe1pIn_EqvbfTEoOKJpc08U8_VccKplmpFwyxmg.ecqyBrGqkO4qX2yO.kdw4UJSIy986g0JnF39gIlMmtfQ_UBAnrTgHbNntdTa99-n2kIt9LHxWqVm1wdgh7893m8o90pOzKyb3VbhVeYwtWzHi0vEVfZkxb6WC9HrPxc-qxsjTGyLlQVDTHDwx9yt_mUVatsT_yoZ6rgNxXtqRZnUTKrscDuEg_qCr1_5IkqYCKzqJelYfFW8sIE2yLBdTa9N-IVFP2uuV5zCL_uYMxd2gd0yH343y4IAvUzPN46FOt33TLoc0P7WBHPzAaLdFY5mEhRv9cPIisMK-TnhJYW3kmNzt6aZguazWz7sBJxPPEJuro_xf_K8NUMxqPvqqlwYDP0IDt1Srpk9ES81o.xa4Z5JKVt9oNdDKwjxGJhw', 1, '["e26325bc-3727-11f0-8fd9-ca45fa178246", "e26349fc-3727-11f0-8fd9-ca45fa178246", "e2635050-3727-11f0-8fd9-ca45fa178246", "e2635258-3727-11f0-8fd9-ca45fa178246", "e2636658-3727-11f0-8fd9-ca45fa178246", "e263684c-3727-11f0-8fd9-ca45fa178246", "e263684e-3727-11f0-8fd9-ca45fa178246"]', NULL, NOW(), NOW()),
('4', 'innovatevn2_int', 'PID', 'eyJhbGciOiJBMjU2S1ciLCJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIiwidHlwIjoiSldUIiwiemlwIjoiREVGIn0.ME1IWKvNCGuBHgG_V8SKhkL_5yrYTE5dVzhzTvj2-aSyR71mDVluxQ.3OqjP1lG_hlk3kgS._sgz86apN1ygXYkZNIOtZDxI8bh51cM5O_N2ll0N3jQJZre1u2xEOx_3gW0xmOZsSX70nQaim_Tc27O2Lpkzi_j8zzQlHnr-y0ayuSysCkmQsGtYgj0_tAsQDUydYI3Lmf5aiJzQajZOk0FdiTn7V9J5ZVVByjb_Nc8yl_QVh5K8mA5VxTAcahGzzIofr_h_vxGGqwEgqAwj-0l0RvJteMFA07wA-OOP5wo0u-nr3wofuMnrwMTLpwhNB_vci71Pwom9lXqMd7vV3HeOs6ja7yx0gjJfO6qp8LEnFhgbgga_kCEd09EcW21fE6AGeDVX_vLMyBP0lrMZXCSFQ0E411W1.u7ABtS7OaS7R1K46gQQ_FA', 1, '["e26325bc-3727-11f0-8fd9-ca45fa178246", "e26349fc-3727-11f0-8fd9-ca45fa178246", "e2635050-3727-11f0-8fd9-ca45fa178246", "e2635258-3727-11f0-8fd9-ca45fa178246", "e2636658-3727-11f0-8fd9-ca45fa178246", "e263684c-3727-11f0-8fd9-ca45fa178246", "e263684e-3727-11f0-8fd9-ca45fa178246"]', NULL, NOW(), NOW()),
('5', 'quirkflarnl_int', 'PID', 'eyJhbGciOiJBMjU2S1ciLCJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIiwidHlwIjoiSldUIiwiemlwIjoiREVGIn0.d_Dp6G10N5VevIrnpsnvjpzzeF2u9zZn0zVgKKo1sZm0f1mCdROEng.vwTFxNpHyKH2x5xn.Wx6rfy57GZNJslLxfDDZUNtjnxjuXDGBCA9DN3qT1QiU3c6qv40Rtaejfkur9f07bgtt0bmHFnJEAJolM2Hz-tSGaDtjVBfmBAWPPVpInxcBoirvyxPdOFItMtTujgLfDjdPNrt-TD-Bi6c49ZTyqdufRfDcDNzeAEu6J_uT1wsdzY3VcCrDGnlTmt8h6NO4pkzm0TP1WAwoVxA9X-C0pQFcL_HSU9oZE9AFdoxK8O3yXSix_QBOHXaqJLxn-bjAFJwVqKuyk9wyBAFt5SDKrpakHsl2AT0g69ieXNzQn8iNFDTDq1qHA5dBbdi3-mMPK7xeFqfOwfo0tobLKXSjlRX0IK6c.dhqwAp68dIyzFwJkdBs7Hw', 1, '["e26325bc-3727-11f0-8fd9-ca45fa178246", "e26349fc-3727-11f0-8fd9-ca45fa178246", "e2635050-3727-11f0-8fd9-ca45fa178246", "e2635258-3727-11f0-8fd9-ca45fa178246", "e2636658-3727-11f0-8fd9-ca45fa178246", "e263684c-3727-11f0-8fd9-ca45fa178246", "e263684e-3727-11f0-8fd9-ca45fa178246"]', NULL, NOW(), NOW()),
('6', 'famewaveaip_int', 'PID', 'eyJhbGciOiJBMjU2S1ciLCJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIiwidHlwIjoiSldUIiwiemlwIjoiREVGIn0.3tJASStix1QgWBHoT3IW4ZkHekaZ6FDt9U_IqbyrX-2D8SRD2dvKYg.LoM_MQift-cHg7P9.oKiUbo0crx7eUPs8QfFN7jSZHUHKRcOFu643gZ1tJp7eBWVEwprHNAWtQqQADWyZpjjFEWEWSAFuGia-baWD_x7I6ufqZap5VrU1rTUre631yd16IU9ns1MPEvNsqUfBWJIrzxyw1cX42U-K9SmxW3KuJ1_6cJH9NkJZZydI7P9YtXnvpa_QVH2L9F1y4I2ArJwafF5Hl5KfNi_agt9nUdBu7Mqrr3eU9-7usAtQ_mhG0UXghS3meBj555O5abad3yIJiITAFlloihH-ndD1CkIg3j0cefbG8WEfT6x0BVGX7IBJ6mehNDDmd1PD6n3FSxXhziPuBR_YCZCWCq8zMy19D-4.ZCL9bKwp8z9oadrsNkvkuQ', 1, '["e26325bc-3727-11f0-8fd9-ca45fa178246", "e26349fc-3727-11f0-8fd9-ca45fa178246", "e2635050-3727-11f0-8fd9-ca45fa178246", "e2635258-3727-11f0-8fd9-ca45fa178246", "e2636658-3727-11f0-8fd9-ca45fa178246", "e263684c-3727-11f0-8fd9-ca45fa178246", "e263684e-3727-11f0-8fd9-ca45fa178246"]', NULL, NOW(), NOW()),
('7', 'buzzboosto6_int', 'PID', 'eyJhbGciOiJBMjU2S1ciLCJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIiwidHlwIjoiSldUIiwiemlwIjoiREVGIn0.qf1ltHYBLRt4jLsI9tCsEfhWwMG74hl1X6Ev-hRkOag9zAzS0ip53Q.6mZX-f8-XR2dVQLG.55a_DgfCOpF7NRn64Pc8s_sACtWq2nG1TYUdY3b0tSgaU2m5MzqqZM2WL0uV8tQHlq7AWgyIwUW-KBpuwnKzDI0V7mqinqqghZHx3wefYt7gVTkkfin8LagNhCs5gFdx4ZP4g_ofkzROL6bMyLdCEGZvja-X2E6U9ktxJBytMuP-h_YrYW8m0qAnV7lXPdZ4zJiAriK6UwNdtHdQLxJuub1oBKP28TpLxcyu2id4tx2LLnmYxHjp40NYXIhS1S7KtLoQ2bgMBo1aAlPACFC0pDBgyEiuM4oMP5dG2iNbNgEEBHrlLX45L3BdRPZ7r6Tpl7CRzzJj3t_I7IoCDuU9CmJ5NBg.jfEuiil8dLtH7x9G5cMfgQ', 1, '["e26325bc-3727-11f0-8fd9-ca45fa178246", "e26349fc-3727-11f0-8fd9-ca45fa178246", "e2635050-3727-11f0-8fd9-ca45fa178246", "e2635258-3727-11f0-8fd9-ca45fa178246", "e2636658-3727-11f0-8fd9-ca45fa178246", "e263684c-3727-11f0-8fd9-ca45fa178246", "e263684e-3727-11f0-8fd9-ca45fa178246"]', NULL, NOW(), NOW()),
('8', 'sanddunesbi_int', 'PID', 'eyJhbGciOiJBMjU2S1ciLCJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIiwidHlwIjoiSldUIiwiemlwIjoiREVGIn0.1LASn2QL8K715AA9Gm7j3iJmW_-n9O27X6yDrxT7hqRAo3TRjum-Ug.Q-aYwjTtYy99u1YD.vEZoS4CqM8aAhnTbEqq9cW_43AJUaHFt2APppjp5d6CoQHGaPM2VQt6zwc4xC1i0y8OrFTLI74hqYoUMzbGJvqEi963wuAdSdjcQ3GCWMNVfjwIg_DugpLl9748aWJPscUTqpYwCGjDbiDY5HmhOJcQGPXXb4QhrrJ9Dk11SkN9MaMfn08n8UUz9PLrU5iJYrX6wqMTH0hBlQ7mli16qeABYbONaMfEnVrPv2XMzCBBJUP_hImBaI2Uv-oSvud4G4-vWC0DBZt81EVPuFzinfvnNHIfqvO8RvZNiIMMQr_WkMHU4klX_3X-jmHU3eYr6kzoYwXLdQbBrL3d-SMKeq9YAu14.hdJ0OfBZqpbODPGThS-bAQ', 1, '["e26325bc-3727-11f0-8fd9-ca45fa178246", "e26349fc-3727-11f0-8fd9-ca45fa178246", "e2635050-3727-11f0-8fd9-ca45fa178246", "e2635258-3727-11f0-8fd9-ca45fa178246", "e2636658-3727-11f0-8fd9-ca45fa178246", "e263684c-3727-11f0-8fd9-ca45fa178246", "e263684e-3727-11f0-8fd9-ca45fa178246"]', NULL, NOW(), NOW()),
('9', 'ignitemara3_int', 'PID', 'eyJhbGciOiJBMjU2S1ciLCJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIiwidHlwIjoiSldUIiwiemlwIjoiREVGIn0.OnH1s4GQDnjWYXQEAskxouzdq_2MZ-6yhNZrTc6srnwCDsQK3O6HuA.ACJpxmjjCOtjeH_4.0JSK-VUMPhyGx2PBo4TK0EljP_CiDwFhY0J6u3HKpD6aT_8PxitnW7u7LRCj3m9fp13m-1E6sb92udRyVlZALLLhVgwwfi6i9IkUugeYARapx1PlX6nou_gnJTUsKjHPAZe-jgT63SFerbcxKYCmplc---Mqg1WnUEuE1yoo4W4zdPVsBGd6na9MDtjNe_5TmW56AAJ3tOyucbd28EjIomfQb8nM_AXxsHT8lq-ef6L3Iz14-O-teEr6RT4obCxOrQiUGIbq5yGlW_YkWF9y2mdcAtnU75UwI03VTwBb3_jNBdb_JzyD1FsbozAfeG7YoJw-ds3jZ6vRZmjNeuK1lxRKCkw.cvjIEuqqOz1lTQl6SXCyzw', 1, '["e26325bc-3727-11f0-8fd9-ca45fa178246", "e26349fc-3727-11f0-8fd9-ca45fa178246", "e2635050-3727-11f0-8fd9-ca45fa178246", "e2635258-3727-11f0-8fd9-ca45fa178246", "e2636658-3727-11f0-8fd9-ca45fa178246", "e263684c-3727-11f0-8fd9-ca45fa178246", "e263684e-3727-11f0-8fd9-ca45fa178246"]', NULL, NOW(), NOW()),
('10', 'viralcraz7ff_int', 'PID', 'eyJhbGciOiJBMjU2S1ciLCJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIiwidHlwIjoiSldUIiwiemlwIjoiREVGIn0.bm0c9eOHx7nFLTMO0XCoMcjyKYPbWVYjEvwUWywmDTcyhJY-UNkCbg.HNKZfuKFjLij3n3b.JPRIO0PDf7CCcGA5xt6BHoZMm9fugRUVmzIh0hYdG-v2mnYXRXMOp4AvcA3kZ13fgtxnLfNOiSi-UuAWgRvpU7k9e4Qe4JSXB4ZpedPkvFp35USkh1C9PQxOlhIxK_nR798qSmmO7iDX8iwlprPwkmZoO4pilSL5nIwMFVyy8IneM_FfLu7f7uKU5b2WxzTapGsQmzKedyzNg3W8RNGK72jEzb_ySh5UZCVzu3bf0OyOBD9SdzzUXCxb1UkEptvkO4w-4RBBgIjg68stcwWWZ4rPJ2cNY-UOuJxFI9SjrHzvZdV-iMHgQ0f5xCubvLhTAMzH4Fnsniyu9nZya8BEhA6ytyg.75KdgSLlaICg6lkNWqkd_A', 1, '["e26325bc-3727-11f0-8fd9-ca45fa178246", "e26349fc-3727-11f0-8fd9-ca45fa178246", "e2635050-3727-11f0-8fd9-ca45fa178246", "e2635258-3727-11f0-8fd9-ca45fa178246", "e2636658-3727-11f0-8fd9-ca45fa178246", "e263684c-3727-11f0-8fd9-ca45fa178246", "e263684e-3727-11f0-8fd9-ca45fa178246"]', NULL, NOW(), NOW()),
('11', 'visionforgp_int', 'PID', 'eyJhbGciOiJBMjU2S1ciLCJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIiwidHlwIjoiSldUIiwiemlwIjoiREVGIn0.aRb2TKmk_Cjqu8APGRHJNjmkebMdP7z0CgFNiVyDc1xRtQvZTWxnCA.6T11ZGrVGPNOzmBB.AMsUsUb8UOVVtKncjUT0hGNyiCwVE0tyCxK-gZGgrjTgnmQ4d9MFDSEoyTa31dYeBfW3rHhaI7T_gbfS1X6UR6qvH-4X-NQzpUuL3ClQa7STKwCf_rGps9a4ZRjZVQo9WGLIIn9loKoCPekglcTeEMv6LUNd33MhQ44YeUPHD8acc1TSghl4r2De2M8uMVWj65Z-i5RkG7tePHw_3cILpBUdho-Emsv8ED5n5xbnD8LtynQ7Fj4qextqUPp8sEB98I1eocPiAOqzxeFWWokKyyGgh4eamd3prRZJJrgu55otTz5PIO5HE8fSIFJ_bGNNF1J6gYDwVNmZ06eSckmmUYo.yodsh4RmcY1ao6VsRhQljg', 1, '["e26325bc-3727-11f0-8fd9-ca45fa178246", "e26349fc-3727-11f0-8fd9-ca45fa178246", "e2635050-3727-11f0-8fd9-ca45fa178246", "e2635258-3727-11f0-8fd9-ca45fa178246", "e2636658-3727-11f0-8fd9-ca45fa178246", "e263684c-3727-11f0-8fd9-ca45fa178246", "e263684e-3727-11f0-8fd9-ca45fa178246"]', NULL, NOW(), NOW()),
('12', 'artistrywk7_int', 'PID', 'eyJhbGciOiJBMjU2S1ciLCJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIiwidHlwIjoiSldUIiwiemlwIjoiREVGIn0.C8WCfFNv1hAtq_mBvH_p2vVzNy5_5wyOCubS-MU0Qp24Ca2VIPm9pA.MrdypLoBR52VcgHg.Un1OOBsh1ohWhW8GMdnqc2W1LLfn5tWpPPkKtUOPrc1BKdMh_sNlEJNy3cHf1TP1TRj89y-nA4sYaPV0kPQix-0YytdUmaXV54h5X_ECN12TxBTug66BGKAW6aqdqjbtycmD7yyu-OQQ0TY14iNPua9Um5qli-ZTNHgNyvZJEM0DDano-zberAraPdGLfxGYy2CUxF7lSkmSAI3YHpZ3nNJdgp5hz-esM5pXESFtoKDwLLh50KrI1Qumn41jovlaQK7_u3_clErg-_neawYxlVB1AEQ1HpmeRS_l8wSABZu-r9cxlflQYTsubh_3cHPxS7jdfrHtDYgLC4PVI1JzM3TcT9E.edOEzHOUKFRb22YJ3fl81A', 1, '["e26325bc-3727-11f0-8fd9-ca45fa178246", "e26349fc-3727-11f0-8fd9-ca45fa178246", "e2635050-3727-11f0-8fd9-ca45fa178246", "e2635258-3727-11f0-8fd9-ca45fa178246", "e2636658-3727-11f0-8fd9-ca45fa178246", "e263684c-3727-11f0-8fd9-ca45fa178246", "e263684e-3727-11f0-8fd9-ca45fa178246"]', NULL, NOW(), NOW()),
('13', 'craftifysqy_int', 'PID', 'eyJhbGciOiJBMjU2S1ciLCJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIiwidHlwIjoiSldUIiwiemlwIjoiREVGIn0.NqBQ3jB9vHfTbLrObwrw-9ILsTfyNDZMEY7QoprLKNeIm7l3xU7ksg.qhDDaSg0OiivQUhY.0QRV0Xy9KCxR3clgg9PX00DzDnfYstBCR6XHuA9h6OWJvPwsNcmh11gATmXA5g3Z2SRYgBL8jnTUUd7AxMBsvgKrBaXD6rni_yGQQeXVVy2XclthuGAfeysv2ttGbCxsegbvyi69kj9puQFU0EMo_b8px06QFrr__ngx-4qf4Rke8OJ7Df57Pu8Kad9QAVkjp9GB2qdJr4jxWedXbms9NH8wFaaO53o1b5ioqtII0DnUk0IsTbUSE6QjtLgC7wLj5ocM0NAZRWvQOEKvaaWE-Pzy6TJjdSacOroubaPlksSA1vQTVep221tiHW4yLiaSM3LUvfyoPii4bMdSaPEJ.TmMeCb80-6awoGb6jaOwTw', 1, '["e26325bc-3727-11f0-8fd9-ca45fa178246", "e26349fc-3727-11f0-8fd9-ca45fa178246", "e2635050-3727-11f0-8fd9-ca45fa178246", "e2635258-3727-11f0-8fd9-ca45fa178246", "e2636658-3727-11f0-8fd9-ca45fa178246", "e263684c-3727-11f0-8fd9-ca45fa178246", "e263684e-3727-11f0-8fd9-ca45fa178246"]', NULL, NOW(), NOW()),
('14', 'admiragezz_int', 'PID', 'eyJhbGciOiJBMjU2S1ciLCJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIiwidHlwIjoiSldUIiwiemlwIjoiREVGIn0.D7p_zUn0kGAI4i8VZ-qR6wDvYa_G4MNd6f2L5fkcVwB7G4PDBpJUBg.lkpTXdFymAMDKaRt.PZ8fZYehMc_PSCC_E9YtQRiDVPC1cwdyzdLRgQzpdNcxvx15ZWXFYuFeoeEdFibb-lG44IpmhDkdFE-d2gyQrHw_lng5xNtExcwlF3b0AMd2QU8rDgQWe_lpntEHLyru4iZLfynSNjVb3aHC6v-2XbO3a-q-J1lXsC4vxPW5TdpWm_cylrQTfYyq4I2E2o8703LGq0hIwHmhuF77JkSJWTA1cm4qGJ1PY0IQrgKocRT3xbYWp2QIInS1k8v9OKrxYh8Oq5OW3W_zHxgw2WJzeWQAQYpoj-bdV1ePapB5ysGrvo90E3kZK4MtcaWc7ADrnU02eKEjFEElNQ655xRAq8Kh-9k.yrcSuMGKG3dlDBDAxhfvPg', 1, '["e26325bc-3727-11f0-8fd9-ca45fa178246", "e26349fc-3727-11f0-8fd9-ca45fa178246", "e2635050-3727-11f0-8fd9-ca45fa178246", "e2635258-3727-11f0-8fd9-ca45fa178246", "e2636658-3727-11f0-8fd9-ca45fa178246", "e263684c-3727-11f0-8fd9-ca45fa178246", "e263684e-3727-11f0-8fd9-ca45fa178246"]', NULL, NOW(), NOW()),
('15', 'engagepullv_int', 'PID', 'eyJhbGciOiJBMjU2S1ciLCJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIiwidHlwIjoiSldUIiwiemlwIjoiREVGIn0.POXZ68LfOX8bsiZXUVtLBwtBSmqwedq3LvhkJhAkhq3eImc5drmJGQ.AwoqC4CDQHfI7ggi.OZM0kmuz3TSeFBcES396GluG7cDenu-og7RdHG58eMm3i_jOsTcOnakhpT8l5viPeUkrR_ii313XKvbQEic-c2sSYPtANzKY60Bwq-B0ipUbJ4KsKayRehwl8c_jkVelqQVoOhREsxakEs0Rzao9D6wGXd8ey0kYBz4EYyp0R4gSmjHlJWBy-pHXcS1NpWBnSwaPkEjMrzondN610AwvEyVoAK0PGx8RFUMD5jvqO1SGfx5P83AcbcNU-8kKdh_eL2XIA6RwyB7TejkHIqYEL7IZ5QJ0gujTo_LxsMhOpq5HuWrnpAEXgxeAAGU64p7UPGB2YzvC-zYf4U8vM9VYt-A.idcuu_HGBNRa1gFiC2wJeg', 1, '["e26325bc-3727-11f0-8fd9-ca45fa178246", "e26349fc-3727-11f0-8fd9-ca45fa178246", "e2635050-3727-11f0-8fd9-ca45fa178246", "e2635258-3727-11f0-8fd9-ca45fa178246", "e2636658-3727-11f0-8fd9-ca45fa178246", "e263684c-3727-11f0-8fd9-ca45fa178246", "e263684e-3727-11f0-8fd9-ca45fa178246"]', NULL, NOW(), NOW()),
('16', 'advoyage7e_int', 'PID', 'eyJhbGciOiJBMjU2S1ciLCJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIiwidHlwIjoiSldUIiwiemlwIjoiREVGIn0.5VZdhVUGx7AtNw3H_nDdrP0zpHlDp7vwlVpsQtcSSo4lX066g3mnYA.fu1JvACAuV9-aPXn.jOEO3XbcQYY9Fw7ABnoGpHsL1kXiHhsWUXOY809sZirv4AzsV1S0bd1DOh0DXK4O7_OI-YEGloDPje1M0YH-iRTeevIUWm4ZDRr2xQNo0XCk2S_sus9a6bPWPjaRqbhzrL2Zqf-tn6cB_ELTDlW3QSAclFIYLnjQwn3e-hxIpX_Vm-5jcX_GOsxcTkDJVC6NyFeUwtD_X5LDFJdFOwbmVIwfB2U64mDZTBY8aTl2d8p49wFtuvUjJpIVm9mnjzo-isC5cSlX4FPQghUizTLZl7JVxIifKbuj70bSDal_u4JA6_6febfGyNpgec75ggsUpzkHefuadzSTqO3e4Dk78EiXcSXN.T7H_v_5ayeeENC4p-OSNJg', 1, '["e26325bc-3727-11f0-8fd9-ca45fa178246", "e26349fc-3727-11f0-8fd9-ca45fa178246", "e2635050-3727-11f0-8fd9-ca45fa178246", "e2635258-3727-11f0-8fd9-ca45fa178246", "e2636658-3727-11f0-8fd9-ca45fa178246", "e263684c-3727-11f0-8fd9-ca45fa178246", "e263684e-3727-11f0-8fd9-ca45fa178246"]', NULL, NOW(), NOW()),
('17', 'visionaryz9_int', 'PID', 'eyJhbGciOiJBMjU2S1ciLCJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIiwidHlwIjoiSldUIiwiemlwIjoiREVGIn0.dMqDMq2CXEDxKXO4YOM8BUyrgcW98iu6KgONGToltAFIW1aYMsdQjQ.O4TPHcEJaEGXYjLG.52rkH4C6NBVXb1pZyqeZVO43b7-559nOms7yd6JNswj25Ic0SNyzi7Jjrd2J3r5L0KcZc1-byHGSW1lBbXaxFvaL6S9c0XvbFsvfn-X-nDUjdFbPRmslwE_q1BXpTRpds2hq7eydhAKqZphMmBkZaXs3YKTecKpzCpRqyJWKizt1c-dPSfOS-KUWiSlzgWlcIJYO8Gb9BAB5wkl9m5FE85w3HPnjVT_T2S3-cuDz1FOesOFhxGoL9AmUTNjHSh-_JnCpjWGHiWzlY_wMw2NIt4B7H-onKu6u3S0hRcYa-P2mbmy7PG0OWclv3se8HtN37t5TEC8lZXcSKU6nqe4uhc6KEO7g.ugm4uO9umu2Hpg6PzW-2bg', 1, '["e26325bc-3727-11f0-8fd9-ca45fa178246", "e26349fc-3727-11f0-8fd9-ca45fa178246", "e2635050-3727-11f0-8fd9-ca45fa178246", "e2635258-3727-11f0-8fd9-ca45fa178246", "e2636658-3727-11f0-8fd9-ca45fa178246", "e263684c-3727-11f0-8fd9-ca45fa178246", "e263684e-3727-11f0-8fd9-ca45fa178246"]', NULL, NOW(), NOW()),
('18', 'emiratein03_int', 'PID', 'eyJhbGciOiJBMjU2S1ciLCJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIiwidHlwIjoiSldUIiwiemlwIjoiREVGIn0.R4uHSKM9r3kZVkKENMDwvVJrAkMFqc4Jkaoka4e7LB7XQ9ZHusBNxA.LAuetxdjWjUINNU3.yWUTsLtmpMfo6ltKAEB8G-U-kuTkWhnl0rM3T3IjW3iIJ0Zwvd13ah4ST-ZXpon9hq-vxS0KrdAirrfA4Ubq2Z4nqrqVZXsYMoOdCC9PYF0JPh4m7fSoReCXkbqM9Cc9Vugd6Xuj16H0EQv_gxE8wlzqQQWSs7NsGZRTKSzoVvHX6N0tANycHlkP2qIT9t1w4HwJOdf2QJPdJIpcsiDdgXXJ1oNxSbJAfv-ie8aNdfMOANwWpnve-OhcXtMbkKVEa1ieuhAJmulR9R-Jqp-KwEzuUZTm9LUu-uGYmjWBzC9mRFMPkcu9iAT0bYhMfE1qyaGnD2KID2LA7o0vN0Fl6JG-.3_vynXDf4EiWnAKtCspZ2w', 1, '["e26325bc-3727-11f0-8fd9-ca45fa178246", "e26349fc-3727-11f0-8fd9-ca45fa178246", "e2635050-3727-11f0-8fd9-ca45fa178246", "e2635258-3727-11f0-8fd9-ca45fa178246", "e2636658-3727-11f0-8fd9-ca45fa178246", "e263684c-3727-11f0-8fd9-ca45fa178246", "e263684e-3727-11f0-8fd9-ca45fa178246"]', NULL, NOW(), NOW()),
('19', 'smartleadtv_int', 'PID', 'eyJhbGciOiJBMjU2S1ciLCJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIiwidHlwIjoiSldUIiwiemlwIjoiREVGIn0.XgqhTQhkXYSU4TFhiqGMTbhC9v5ztPsHjGIuInX4Jz3n04AzMNLKTA.HjCczQVjDkZLfEmN.wZVL4unBiUS3XE0oLAVGOVew_kPNZpmwviVVR1K2DPP8jxHBN28y41j0Bhp_QjKKvgs9vRNxL059oWp44VRU4GKAO9HyMlVWocRIS5ZLvga0aMhYEXAW_gT3GU6EKZ-sxpKTsxdP1r1yTztbx3UhLF7j13g8eLxh0z1Ox1RL0RWYLG_zze9zbyV9Ph1Se77lgyRiiCcUTkcDmo52rIYvNQgd8ppKkGFWvAByTIG41VQlcIdl3KaVW3YgadTm8NVZusaSak26Qmr8RDffrwhM0BGqDfkK6jTTrsb8XsGtTAcrNOpxbvBZIJ2BccJ44gxQWuSW_fW3gMuxJ3ZU7eEQRhlp911e.cHNK63oMbIRn7aFXdMmaIA', 1, '["e26325bc-3727-11f0-8fd9-ca45fa178246", "e26349fc-3727-11f0-8fd9-ca45fa178246", "e2635050-3727-11f0-8fd9-ca45fa178246", "e2635258-3727-11f0-8fd9-ca45fa178246", "e2636658-3727-11f0-8fd9-ca45fa178246", "e263684c-3727-11f0-8fd9-ca45fa178246", "e263684e-3727-11f0-8fd9-ca45fa178246"]', NULL, NOW(), NOW()),
('20', 'pulseplaygxk_int', 'PID', 'eyJhbGciOiJBMjU2S1ciLCJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIiwidHlwIjoiSldUIiwiemlwIjoiREVGIn0.H8yXq4Q720YB8HeDK3Bm4uBor6nMAsqP3-OJ-QQvor5-I855R_OKYQ.AQ4YNRghARfWYHJ3.adDQndjnqmHpyGxUELyP4sgOV38DEiAENFviK7h2l8nNLjPZrkddihRxT3mnQI-LzB76Ympo3Wx21jzmyiVFoxcpZfk-ZtMqWkBJT0wf36CMl1qpLdPls2cX_t0w0fU2k5kTQTrNybyAioGjG4uCFGKT7JPWmtJ75AhUHofuDodvrgqfH32Tc1dAFxHr2o1op5bW8EHcBZCDVslAri7vpOEoOW5Iq8PB9XiMbzbbmuE5lpMS-_T5rlMalQbc1MgR10_K-9PfrSKBd9agAZA5YQcSAw3BvXCFD6u-72nMhQeZ2ZOuHMq56hLupzowyNN8TQA3i-w1jJ7hj6oOZ7Fu4hGWsveJRQ.TKgaB3n-UmFM4wgdmnsHkQ', 1, '["e26325bc-3727-11f0-8fd9-ca45fa178246", "e26349fc-3727-11f0-8fd9-ca45fa178246", "e2635050-3727-11f0-8fd9-ca45fa178246", "e2635258-3727-11f0-8fd9-ca45fa178246", "e2636658-3727-11f0-8fd9-ca45fa178246", "e263684c-3727-11f0-8fd9-ca45fa178246", "e263684e-3727-11f0-8fd9-ca45fa178246"]', NULL, NOW(), NOW()),
('21', 'smarleadadhk199', 'PRT', 'eyJhbGciOiJBMjU2S1ciLCJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIiwidHlwIjoiSldUIiwiemlwIjoiREVGIn0.x7_ojtY2thEQzc-uORCd_5v87bYMPT8jgsF8DmQPa2HSDFL8JYXKZw.hmMJY9Md3bjlApSK.mTflkyWpRKHxC_ZszhIi2QzJoTq4WVo8e9EZvYwEb4AccXp_FpkOWIfs5UMzvvpIItzEtN57Ax6B-VoMSG4OhprgLdmZzVuGRbaCL72vC6EFHXt0Um2IY4WbQj-rTqHL-7is2oHVjV0IwiXPrNX5xQqOjEGOvF6XaHZMg_O4cUW6XfI95wFWsgwYz3G4f2RLKmazRS2-tVlUdUlz8YGpUe2lCU-Lrpyqq7jlthJVAIkKHckcCYcxgVLr6rsbDVlmk06Y2kw4MAbglL7VcqdnaRJ44XI6_wShai1Xa-n82C4cGRH3Hsjy5lNfzjv6LsqVSicx8-hwFdIkl3c14NpW0Q.huQ06Uyp3thbkNrGEtrgOQ', 1, '["e26325bc-3727-11f0-8fd9-ca45fa178246", "e26349fc-3727-11f0-8fd9-ca45fa178246", "e2635050-3727-11f0-8fd9-ca45fa178246", "e2635258-3727-11f0-8fd9-ca45fa178246", "e2636658-3727-11f0-8fd9-ca45fa178246", "e263684c-3727-11f0-8fd9-ca45fa178246", "e263684e-3727-11f0-8fd9-ca45fa178246"]', NULL, NOW(), NOW()),
('22', 'imonddelmecn768', 'PRT', 'eyJhbGciOiJBMjU2S1ciLCJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIiwidHlwIjoiSldUIiwiemlwIjoiREVGIn0.5fDqi-3UvwqMDk1qpU1bzjHAE6925DEg3ucEl29ELwNnKfCBYouzmA._RT2MN51z8OoBQ20.VLx2BPVQf9vH9JbWASgJ61Z2nloPkez1XT0MSu6YXW981hFyIqdu9arfdkwUwKEZ0NKGsVWjnhL1g2HlHo9tGqxvSEhNjO_goZN6HUC6HFsjhoJlbwUA9oe2EWC8K61eTWLqzrRXh6VOQPC6LVkYsvoeZvJDyyXjolomwBRzSGtYJCCipRTGWjiTV8hvrMnJ8CVft1hzzuaw2cLtl6QAPtSzALHuu5psIHqBwCphtbUMs6kBFJolD20RTkQ58nWh-ixcsNH59dk8smIBKmi5DrKlRTXPtiix7GU_ZeaZpAfIC_YK5jm9q5GE3y9IuPBIYZu97WTk7IHRvf3qsuAoDu_cqw.s8O8TzO2Z22CmI8aiTzsmw', 1, '["e26325bc-3727-11f0-8fd9-ca45fa178246", "e26349fc-3727-11f0-8fd9-ca45fa178246", "e2635050-3727-11f0-8fd9-ca45fa178246", "e2635258-3727-11f0-8fd9-ca45fa178246", "e2636658-3727-11f0-8fd9-ca45fa178246", "e263684c-3727-11f0-8fd9-ca45fa178246", "e263684e-3727-11f0-8fd9-ca45fa178246"]', NULL, NOW(), NOW()),
('23', 'donmbatterhk252', 'PRT', 'eyJhbGciOiJBMjU2S1ciLCJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIiwidHlwIjoiSldUIiwiemlwIjoiREVGIn0.1L4HC6KCDqmdF4thxlo3uwW9RsJUxH6C34fr8cx8KHYATLla-5k3ig.BWpEiSFxxbXOr3c-.yqEM_rllqXcSMiZJ0E8yTtFQADpZSTddGJAmCVegOiTxUAFRBLT54V7FjYI-S4_SH7koYQAdUm98A5zcsAUM8nRN4LLaDERKNlEiWWs6PvtzmCOqHZBbfn2rFaTsHa2hGIt1ExPcrmTnqiNuzIOv9cpN7g8XomTMIJ8nzScDquUbxT976PPPw98Vtj5fT4Qn8RYRKfcesDQ1K8OEaG5LiZJvhLBXr9fUfr8DkgOLebkqzxa_6AaxGMVUsEp0Mzm5D1KNv64O3nwLzUtO_JLLwpLLwSMWLh84u9fncFWcoCHzjf_XNfADlhZ-I9AUK16eyUlLbiKam5Y7BNYbLYNjLeKCad9Q9Q.YMNSabVu6jU302LavT8_Uw', 1, '["e26325bc-3727-11f0-8fd9-ca45fa178246", "e26349fc-3727-11f0-8fd9-ca45fa178246", "e2635050-3727-11f0-8fd9-ca45fa178246", "e2635258-3727-11f0-8fd9-ca45fa178246", "e2636658-3727-11f0-8fd9-ca45fa178246", "e263684c-3727-11f0-8fd9-ca45fa178246", "e263684e-3727-11f0-8fd9-ca45fa178246"]', NULL, NOW(), NOW());
/*!40000 ALTER TABLE `account_configs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `accounts`
--

DROP TABLE IF EXISTS `accounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `accounts` (
  `id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `account_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `account_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `account_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `api_token` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `app_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `app_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_account_type` (`account_type`),
  KEY `idx_account_name` (`account_name`),
  KEY `idx_account_id` (`account_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `accounts`
--

LOCK TABLES `accounts` WRITE;
/*!40000 ALTER TABLE `accounts` DISABLE KEYS */;
INSERT INTO `accounts` VALUES ('670b63db-6087-4da3-948b-fbcc19388103','PID','adgeniuszii_int','adgeniuszii_int',NULL,'com.voghion.app','Voghion - Online shopping app','2025-05-28 17:37:45','2025-05-28 17:37:45'),('7e26006e-ee6c-41f2-ab68-861461a504ad','PID','adgeniuszii_int','adgeniuszii_int',NULL,'com.bonnie.trafficescape','Traffic Escape!','2025-05-26 23:21:58','2025-05-26 23:21:58'),('8e217598-1214-406f-9ddc-ac701a51ba06','PID','adgeniuszii_int','adgeniuszii_int',NULL,'6453522960','Traffic Escape!','2025-05-27 23:36:18','2025-05-27 23:36:18');
/*!40000 ALTER TABLE `accounts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `download_records`
--

DROP TABLE IF EXISTS `download_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `download_records` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `run_id` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_path` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_size` bigint NOT NULL,
  `status` enum('pending','completed','failed') COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_run_id` (`run_id`),
  KEY `idx_status` (`status`),
  CONSTRAINT `download_records_ibfk_1` FOREIGN KEY (`run_id`) REFERENCES `query_executions` (`run_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `download_records`
--

LOCK TABLES `download_records` WRITE;
/*!40000 ALTER TABLE `download_records` DISABLE KEYS */;
/*!40000 ALTER TABLE `download_records` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `execution_logs`
--

DROP TABLE IF EXISTS `execution_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `execution_logs` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `run_id` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `log_type` enum('info','error','warning') COLLATE utf8mb4_unicode_ci NOT NULL,
  `log_content` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_run_id` (`run_id`),
  KEY `idx_log_type` (`log_type`),
  CONSTRAINT `execution_logs_ibfk_1` FOREIGN KEY (`run_id`) REFERENCES `query_executions` (`run_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `execution_logs`
--

LOCK TABLES `execution_logs` WRITE;
/*!40000 ALTER TABLE `execution_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `execution_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `query_executions`
--

DROP TABLE IF EXISTS `query_executions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `query_executions` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `run_id` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `query_params` json NOT NULL,
  `status` enum('running','completed','failed') COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `run_id` (`run_id`),
  KEY `idx_run_id` (`run_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `query_executions`
--

LOCK TABLES `query_executions` WRITE;
/*!40000 ALTER TABLE `query_executions` DISABLE KEYS */;
/*!40000 ALTER TABLE `query_executions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `query_logs`
--

DROP TABLE IF EXISTS `query_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `query_logs` (
  `id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `query_result_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `account_type` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `account_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `app_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `app_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `event_filter` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '事件过滤条件',
  `mode` enum('normal','aggregate') COLLATE utf8mb4_unicode_ci DEFAULT 'normal' COMMENT '查询模式：normal或aggregate',
  `data_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `from_date` date NOT NULL,
  `to_date` date NOT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci,
  `api_response` json DEFAULT NULL,
  `error_details` json DEFAULT NULL,
  `row_count` int DEFAULT NULL,
  `afid_deduplication_count` int DEFAULT NULL COMMENT 'AFID去重数量',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_query_result_id` (`query_result_id`),
  KEY `idx_account` (`account_type`,`account_id`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `query_logs`
--

LOCK TABLES `query_logs` WRITE;
/*!40000 ALTER TABLE `query_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `query_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `query_results`
--

DROP TABLE IF EXISTS `query_results`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `query_results` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `run_id` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `data` json NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_run_id` (`run_id`),
  CONSTRAINT `query_results_ibfk_1` FOREIGN KEY (`run_id`) REFERENCES `query_executions` (`run_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `query_results`
--

LOCK TABLES `query_results` WRITE;
/*!40000 ALTER TABLE `query_results` DISABLE KEYS */;
/*!40000 ALTER TABLE `query_results` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `reports`
--

DROP TABLE IF EXISTS `reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reports` (
  `id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `report_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('uploading','uploaded','processing','completed','failed') COLLATE utf8mb4_unicode_ci DEFAULT 'uploading',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `size` bigint DEFAULT NULL,
  `account_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `account_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `app_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `app_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `data_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mode` enum('normal','aggregate') COLLATE utf8mb4_unicode_ci DEFAULT 'normal' COMMENT '报表模式：normal或aggregate',
  `date_range_start` date DEFAULT NULL,
  `date_range_end` date DEFAULT NULL,
  `record_count` int DEFAULT NULL,
  `primary_attribution_count` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_status` (`status`),
  KEY `idx_create_time` (`create_time`),
  KEY `idx_app_id` (`app_id`),
  KEY `idx_account` (`account_type`,`account_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `reports`
--

LOCK TABLES `reports` WRITE;
/*!40000 ALTER TABLE `reports` DISABLE KEYS */;
/*!40000 ALTER TABLE `reports` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `temp_files`
--

DROP TABLE IF EXISTS `temp_files`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `temp_files` (
  `id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `report_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_path` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `account_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `account_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_report` (`report_id`),
  KEY `idx_account` (`account_type`,`account_id`),
  CONSTRAINT `temp_files_ibfk_1` FOREIGN KEY (`report_id`) REFERENCES `reports` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `temp_files`
--

LOCK TABLES `temp_files` WRITE;
/*!40000 ALTER TABLE `temp_files` DISABLE KEYS */;
/*!40000 ALTER TABLE `temp_files` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` enum('Super Admin','User','Team5','Team9') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'User',
  `username` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_login` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `avatar` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_email` (`email`),
  KEY `idx_role` (`role`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES ('e26325bc-3727-11f0-8fd9-ca45fa178246','simon@smartlead.tech','pbkdf2:sha256:1000000$CVP0bssJXm5ed5lS$cb31c94bc5be0b0b76272afc10479d65dd2d146677a80611a24012ba70ac9d57','Super Admin','Simon','2025-05-28 17:07:35','2025-05-23 00:14:48','2025-05-28 17:07:35',NULL),('e26349fc-3727-11f0-8fd9-ca45fa178246','lip@smartlead.tech','pbkdf2:sha256:1000000$EjtBcZYQ18mw9Roq$f8a26d61bdec50f93f640da3573361e9cdfd3836d47a785f321753d89c09becc','Team5','Lip','2025-05-28 19:35:13','2025-05-23 00:14:48','2025-05-28 19:35:13',NULL),('e2635050-3727-11f0-8fd9-ca45fa178246','roy@smartlead.tech','pbkdf2:sha256:1000000$UqtPTIQJA2bM4dyx$53b65a13116d14e17a8e6ad888759d2061a33e71aa7d5d141f7a84358d4df0e5','Team5','Roy',NULL,'2025-05-23 00:14:48','2025-05-26 19:12:01',NULL),('e2635258-3727-11f0-8fd9-ca45fa178246','delores@smartlead.tech','pbkdf2:sha256:1000000$NUVFEX7NGda68DZk$07d2204f2549882adebb87863ec93d2e5f313fd11ed333da5a6d11e7afe05cbf','Team5','Delores',NULL,'2025-05-23 00:14:48','2025-05-26 19:12:01',NULL),('e2636658-3727-11f0-8fd9-ca45fa178246','baron@smartlead.tech','pbkdf2:sha256:1000000$7qdvnwtkmaIGKycb$0e92d7d324c4429b269d990dc9ce6dabadfbae9b668c6252bedf507256af8fef','Team5','Baron',NULL,'2025-05-23 00:14:48','2025-05-26 19:12:01',NULL),('e263684c-3727-11f0-8fd9-ca45fa178246','harris@smartlead.tech','pbkdf2:sha256:1000000$AzsMgaEBZJN2esEB$8096f0b79bbd7eadabf8a214dc76a994fc7b9cddf8959dcd45d31a729cae9201','Team5','Harris','2025-05-23 00:15:30','2025-05-23 00:14:48','2025-05-26 19:12:01',NULL),('e263684e-3727-11f0-8fd9-ca45fa178246','helen@smartlead.tech','scrypt:32768:8:1$AWF76Qos7kSj54X2$eafbd9a01ec6814e2cc2b167e46f0c2ef242b3a378e1555ae73b646ca9fbfc921e15376b7ad6cc671dff9492df2e1d158cb3666abcada1a82c1eaad7c38d54b8','Team5','Helen',NULL,'2025-05-23 00:14:48','2025-05-23 00:14:48',NULL),('e263684d-3727-11f0-8fd9-ca45fa178246','rosa@opt360.net','scrypt:32768:8:1$9PgsIa33l1pNaG2H$f78ae67c18577fd9619eef02fdce249bce570ecdc69f9e6c14fb4093cf41a72de5b0c3d21996ec70c11618bcea0483299138b43a4824455bb1f19f1693bbbf0b','Team9','Rosa',NULL,'2025-05-23 00:14:48','2025-05-23 00:14:48',NULL);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

SET FOREIGN_KEY_CHECKS = 1;

/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;
/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-05-29  0:01:32
